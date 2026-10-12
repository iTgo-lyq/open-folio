import "server-only";
import { createDecipheriv, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  cp,
  rename,
  rm,
  chmod,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.ts";
import {
  identitySchema,
  workspaceStateSchema,
  privateKey,
  atomicPrivate,
  credentialFingerprint,
  encryptWorkspace,
  decryptWorkspace,
  type WorkspaceState,
} from "./personal-sessions.ts";
import {
  SecretHandle,
  repositoryKey,
  type RepositoryIdentity,
} from "./providers/types.ts";
import { discoveryJobSchema } from "./discovery.ts";
import { SnapshotStore } from "./store.ts";
const hash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
const legacyConnection = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    identity: identitySchema,
    label: z.string().min(1).max(100),
    nonce: z.string(),
    ciphertext: z.string().max(8192),
    tag: z.string(),
  })
  .strict();
export const legacyStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            cookieHash: z.string().regex(/^[a-f0-9]{64}$/),
            expiresAt: z.number().int().positive(),
            connections: z.array(legacyConnection).max(32),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type LegacyState = z.infer<typeof legacyStateSchema>;
const mappingSchema = z
  .object({
    sessionId: z.string().uuid(),
    connectionId: z.string().uuid(),
    revision: z.number().int().positive(),
    workspaceId: z.string().uuid(),
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    credentialKeyDigest: z.string(),
    identityKeyDigest: z.string(),
    mappings: z.array(mappingSchema),
    state: workspaceStateSchema,
  })
  .strict();
const hex = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const snapshotSchema = z
  .object({
    cacheSchemaVersion: z.literal(3),
    id: z.string().uuid(),
    projectId: z.string().regex(/^[a-f0-9]{64}$/),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
    branches: z.array(z.object({ name: z.string(), commit: hex })),
    documents: z.array(
      z
        .object({
          id: z.string(),
          blob: hex,
          readable: z.boolean(),
          bytes: z.number().int().nonnegative(),
        })
        .passthrough(),
    ),
    specs: z.array(z.unknown()),
    changes: z.array(z.unknown()),
    diagnostics: z.array(z.unknown()),
    currentPrototype: z
      .object({ entries: z.array(z.unknown()), issues: z.array(z.string()) })
      .passthrough(),
    archiveRefs: z.array(z.unknown()),
    archivePins: z.record(z.string()),
    prototype: z.object({ status: z.string() }).passthrough(),
  })
  .passthrough();
function stableUuid(value: string) {
  const bytes = Buffer.from(hash(value).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
async function regular(path: string) {
  const info = await lstat(path);
  if (!info.isFile()) throw Error("Not a regular migration file");
  return readFile(path);
}
async function privateTree(path: string) {
  const info = await lstat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path))
      await privateTree(join(path, entry));
  } else if (!info.isFile())
    throw Error("Migration refuses linked or special files");
}
async function secureTree(path: string) {
  const info = await lstat(path);
  if (info.isDirectory()) {
    await chmod(path, 0o700);
    for (const entry of await readdir(path))
      await secureTree(join(path, entry));
  } else if (info.isFile()) await chmod(path, 0o600);
  else throw Error("Migration refuses linked files");
}
async function completeSnapshot(
  directory: string,
  id: string,
  key: string,
  fingerprint: string,
) {
  const s = snapshotSchema.parse(
    JSON.parse(
      (await regular(join(directory, "snapshots", `${id}.json`))).toString(
        "utf8",
      ),
    ),
  );
  if (s.id !== id || s.projectId !== key || s.fingerprint !== fingerprint)
    throw Error("Snapshot source mismatch");
  for (const doc of s.documents.filter((d) => d.readable)) {
    const bytes = await regular(join(directory, "blobs", doc.blob));
    const digest = createHash(doc.blob.length === 40 ? "sha1" : "sha256")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (bytes.length !== doc.bytes || digest !== doc.blob)
      throw Error("Incomplete snapshot blob");
  }
  return s;
}

// Called while the v2 writer lock is held. No remote request or old-data mutation.
export async function migratePersonalV1(
  root: string,
  keyPath: string,
  identityKeyPath: string,
  checkpoint: (phase: string) => void = () => {},
) {
  if (await exists(join(root, "state.json"))) return false;
  const dataRoot = dirname(root),
    legacyRoot = join(dataRoot, "personal-v1"),
    sourcePath = join(legacyRoot, "sessions.json");
  if (!(await exists(sourcePath))) return false;
  try {
    const lock = await readFile(join(legacyRoot, "writer.lock"), "utf8").catch(
      (e) => {
        if (e.code === "ENOENT") return "";
        throw e;
      },
    );
    if (lock) {
      const pid = Number(lock);
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new AppError("MIGRATION_LOCKED", "请停止旧服务后再升级。", 503);
      if (pid !== process.pid) {
        try {
          process.kill(pid, 0);
          throw new AppError(
            "MIGRATION_LOCKED",
            "旧服务仍在运行，请停止后再升级。",
            503,
          );
        } catch (e) {
          if (
            e instanceof AppError ||
            (e as NodeJS.ErrnoException).code !== "ESRCH"
          )
            throw e;
        }
      }
    }
    const source = await regular(sourcePath),
      old = legacyStateSchema.parse(JSON.parse(source.toString("utf8"))),
      sourceDigest = hash(source);
    const oldKeyPath =
      resolve(keyPath) === resolve(root, "credential-key")
        ? join(legacyRoot, "credential-key")
        : keyPath;
    const oldKey = await privateKey(oldKeyPath, false);
    const decoded = old.sessions.flatMap((session) =>
      session.connections.map((connection) => {
        try {
          const nonce = Buffer.from(connection.nonce, "base64url"),
            tag = Buffer.from(connection.tag, "base64url");
          if (nonce.length !== 12 || tag.length !== 16) throw Error();
          const decipher = createDecipheriv("aes-256-gcm", oldKey, nonce);
          decipher.setAAD(
            Buffer.from(
              JSON.stringify([
                1,
                session.id,
                connection.id,
                connection.revision,
              ]),
            ),
          );
          decipher.setAuthTag(tag);
          const secret = new SecretHandle(
            Buffer.concat([
              decipher.update(Buffer.from(connection.ciphertext, "base64url")),
              decipher.final(),
            ]).toString("utf8"),
          );
          return { session, connection, secret };
        } catch {
          throw new AppError(
            "CREDENTIAL_UNREADABLE",
            "旧凭据无法解密，升级已停止，原数据已保留。",
            503,
          );
        }
      }),
    );
    const manifestPath = join(root, "migration.json"),
      manifestExists = await exists(manifestPath);
    if (!manifestExists && resolve(oldKeyPath) !== resolve(keyPath)) {
      await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
      await writeFile(keyPath, oldKey, { flag: "wx", mode: 0o600 }).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code !== "EEXIST") throw e;
        },
      );
    }
    const credentialKey = await privateKey(keyPath, false);
    if (!credentialKey.equals(oldKey))
      throw new AppError(
        "MIGRATION_KEY_MISMATCH",
        "新旧密钥不匹配，原数据已保留。",
        503,
      );
    const identityKey = await privateKey(identityKeyPath, !manifestExists),
      stage = join(root, "migration-stage");
    let manifest: z.infer<typeof manifestSchema>;
    if (manifestExists) {
      manifest = manifestSchema.parse(
        JSON.parse((await regular(manifestPath)).toString("utf8")),
      );
      if (
        manifest.sourceDigest !== sourceDigest ||
        manifest.credentialKeyDigest !== hash(credentialKey) ||
        manifest.identityKeyDigest !== hash(identityKey)
      )
        throw new AppError(
          "MIGRATION_SOURCE_CHANGED",
          "迁移来源或密钥已变化，请按配套备份恢复，保留当前现场。",
          503,
        );
    } else {
      for (const name of ["repositories-v2", "discovery-v2"])
        if (await exists(join(dataRoot, name)))
          throw new AppError(
            "MIGRATION_TARGET_EXISTS",
            "新缓存目录已存在但缺少迁移记录，原数据已保留。",
            503,
          );
      const state: WorkspaceState = {
          schemaVersion: 2,
          workspaces: [],
          sessions: [],
          legacySelections: [],
        },
        mappings: z.infer<typeof mappingSchema>[] = [];
      for (const { session, connection, secret } of decoded) {
        const identity = connection.identity,
          fingerprint = credentialFingerprint(
            identityKey,
            identity.providerId,
            identity.instanceId,
            secret,
          );
        let w = state.workspaces.find(
          (w) => w.credentialFingerprint === fingerprint,
        );
        if (!w) {
          const base = {
            id: stableUuid(JSON.stringify([sourceDigest, fingerprint])),
            providerId: identity.providerId,
            instanceId: identity.instanceId,
          };
          w = {
            ...base,
            credentialFingerprint: fingerprint,
            identity,
            gitUsername: identity.login,
            label: connection.label,
            createdAt: Date.now(),
            preferences: {},
            legacyConnectionIds: [],
            ...encryptWorkspace(base, secret, credentialKey),
          };
          state.workspaces.push(w);
        }
        if (!w.legacyConnectionIds!.includes(connection.id))
          w.legacyConnectionIds!.push(connection.id);
        mappings.push({
          sessionId: session.id,
          connectionId: connection.id,
          revision: connection.revision,
          workspaceId: w.id,
        });
      }
      for (const session of old.sessions.filter(
        (s) => s.expiresAt > Date.now(),
      )) {
        const choices = mappings
          .filter((m) => m.sessionId === session.id)
          .map((m) => ({
            connectionId: m.connectionId,
            workspaceId: m.workspaceId,
          }));
        if (choices.length)
          state.legacySelections.push({
            cookieHash: session.cookieHash,
            sessionId: session.id,
            expiresAt: session.expiresAt,
            choices,
          });
      }
      manifest = {
        schemaVersion: 1,
        sourceDigest,
        credentialKeyDigest: hash(credentialKey),
        identityKeyDigest: hash(identityKey),
        mappings,
        state: workspaceStateSchema.parse(state),
      };
      await atomicPrivate(manifestPath, JSON.stringify(manifest));
    }
    if (manifest.mappings.length !== decoded.length)
      throw Error("Invalid migration mapping");
    for (const { session, connection, secret } of decoded) {
      const expected = credentialFingerprint(
        identityKey,
        connection.identity.providerId,
        connection.identity.instanceId,
        secret,
      );
      const matches = manifest.mappings.filter(
        (m) =>
          m.sessionId === session.id &&
          m.connectionId === connection.id &&
          m.revision === connection.revision,
      );
      const w = manifest.state.workspaces.find(
        (w) => w.id === matches[0]?.workspaceId,
      );
      if (
        matches.length !== 1 ||
        !w ||
        w.id !== stableUuid(JSON.stringify([sourceDigest, expected])) ||
        w.credentialFingerprint !== expected ||
        !decryptWorkspace(w, credentialKey).use((value) =>
          secret.use((original) => value === original),
        )
      )
        throw Error("Migration credential source mismatch");
    }
    checkpoint("manifest");
    await rm(stage, { recursive: true, force: true });
    await mkdir(join(stage, "discovery"), { recursive: true, mode: 0o700 });
    await mkdir(join(stage, "repositories"), { recursive: true, mode: 0o700 });
    const jobs = new Map<string, z.infer<typeof discoveryJobSchema>>();
    const caches = new Map<
      string,
      {
        source: string;
        key: string;
        workspaceId: string;
        fingerprint: string;
        id: string;
        updated: number;
      }
    >();
    for (const m of manifest.mappings) {
      const w = manifest.state.workspaces.find((w) => w.id === m.workspaceId)!;
      let job: z.infer<typeof discoveryJobSchema>;
      try {
        job = discoveryJobSchema.parse(
          JSON.parse(
            (
              await regular(
                join(
                  dataRoot,
                  "discovery-v1",
                  m.sessionId,
                  m.connectionId,
                  `${m.revision}.json`,
                ),
              )
            ).toString("utf8"),
          ),
        );
        if (
          job.revision !== m.revision ||
          !Number.isFinite(Date.parse(job.updatedAt)) ||
          [...job.pending, ...job.results.map((r) => r.repository)].some(
            (r) =>
              r.providerId !== w.providerId || r.instanceId !== w.instanceId,
          ) ||
          job.results.some((r) => r.key !== repositoryKey(r.repository))
        )
          throw Error();
      } catch {
        continue;
      }
      if (
        Date.parse(job.updatedAt) >
        Date.parse(jobs.get(w.id)?.updatedAt ?? "1970-01-01")
      )
        jobs.set(w.id, job);
      for (const result of job.results) {
        const repo = result.repository as RepositoryIdentity,
          key = repositoryKey(repo),
          fingerprint = hash(JSON.stringify([1, repo.cloneUrl, null]));
        const source = join(
          dataRoot,
          "repositories-v1",
          m.sessionId,
          m.connectionId,
          String(m.revision),
          `${key}-${fingerprint.slice(0, 16)}`,
        );
        try {
          await privateTree(source);
          const id = (await regular(join(source, "current")))
            .toString("utf8")
            .trim();
          if (!z.string().uuid().safeParse(id).success) throw Error();
          const snap = await completeSnapshot(source, id, key, fingerprint),
            candidate = {
              source,
              key,
              workspaceId: w.id,
              fingerprint,
              id,
              updated: Date.parse(snap.capturedAt),
            },
            candidateKey = `${w.id}/${key}`;
          if (candidate.updated > (caches.get(candidateKey)?.updated ?? -1))
            caches.set(candidateKey, candidate);
        } catch {
          /* Unproven or incomplete cache stays only in the unchanged backup. */
        }
      }
    }
    for (const [id, job] of jobs) {
      await mkdir(join(stage, "discovery", id), {
        recursive: true,
        mode: 0o700,
      });
      await atomicPrivate(
        join(stage, "discovery", id, "state.json"),
        JSON.stringify({
          ...job,
          revision: 1,
          ...(job.state === "running"
            ? { state: "interrupted", message: "升级后请继续发现仓库。" }
            : {}),
        }),
      );
    }
    for (const candidate of caches.values()) {
      const target = join(
        stage,
        "repositories",
        candidate.workspaceId,
        candidate.key,
      );
      await cp(candidate.source, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await secureTree(target);
      const newFingerprint = new SnapshotStore(
        join(stage, "repositories", candidate.workspaceId),
        undefined,
        candidate.key,
      ).fingerprint({ id: candidate.key, name: "", repositoryUrl: "" });
      for (const file of await readdir(join(target, "snapshots"))) {
        try {
          if (!/^[a-f0-9-]{36}\.json$/.test(file)) throw Error();
          const snap = await completeSnapshot(
            candidate.source,
            file.slice(0, -5),
            candidate.key,
            candidate.fingerprint,
          );
          await atomicPrivate(
            join(target, "snapshots", file),
            JSON.stringify({ ...snap, fingerprint: newFingerprint }),
          );
        } catch {
          await rm(join(target, "snapshots", file), { force: true });
        }
      }
    }
    checkpoint("caches");
    // These targets are owned by this manifest; no active v2 state exists yet.
    for (const [from, to] of [
      ["repositories", "repositories-v2"],
      ["discovery", "discovery-v2"],
    ]) {
      await rm(join(dataRoot, to), { recursive: true, force: true });
      await rename(join(stage, from), join(dataRoot, to));
      checkpoint(to);
    }
    await atomicPrivate(
      join(root, "state.json"),
      JSON.stringify(workspaceStateSchema.parse(manifest.state)),
    );
    checkpoint("state");
    await rm(stage, { recursive: true, force: true });
    return true;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "MIGRATION_FAILED",
      "旧连接升级未完成，原数据与迁移现场已保留，请修复后重试。",
      503,
    );
  }
}
