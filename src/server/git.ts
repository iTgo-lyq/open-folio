import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  chmod,
  access,
  readFile,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import type { GitTransport } from "./providers/types.ts";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  Branch,
  DocumentRef,
  Limits,
  Snapshot,
  Diagnostic,
  ChangeRoute,
} from "../lib/model.ts";
import { inspectMarkdown } from "../lib/markdown.ts";
import { AppError } from "./errors.ts";
import { isSvgImage } from "./svg.ts";
import { changeSchema, workflowCoreSchema } from "./schema.ts";
import {
  routeCatalog,
  changeLocation,
  validBranchName,
  parentBranch,
  parentArchive,
  sourceOwnership,
  resolvePlanningRoute,
  planningRecord,
} from "../../.agents/skills/spec-trail/scripts/routing.mjs";
import { INTEGRATION_VERSION } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
const exec = promisify(execFile);
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// Bump the version when scanning or indexing semantics change.
export const scanFingerprint = (limits: Limits) =>
  hash(JSON.stringify([11, limits]));
export const documentId = (branch: string, path: string) =>
  hash(`${branch}\0${path}`).slice(0, 32);
const safePath = (s: string) =>
  s.startsWith("docs/project/") &&
  !/[\\\u0000-\u001f\u007f]/.test(s) &&
  s.split("/").every((p) => p && p !== "." && p !== "..");
export function imageMime(b: Buffer): string | undefined {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()))
    return "image/gif";
  if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (
    b.subarray(4, 8).toString() === "ftyp" &&
    ["avif", "avis"].includes(b.subarray(8, 12).toString())
  )
    return "image/avif";
  if (isSvgImage(b)) return "image/svg+xml";
}
type CollectedData = Pick<
  Snapshot,
  | "integrationBranch"
  | "branches"
  | "routes"
  | "sourceDiagnostics"
  | "integrations"
  | "documents"
> & {
  blobs: Map<string, Buffer>;
  unchanged: boolean;
  releaseSource: import("../lib/model.ts").ReleaseSource;
};
export class GitReader {
  directory: string;
  url: string;
  protocol: "https" | "file";
  private transport?: GitTransport;
  signal?: AbortSignal;
  constructor(
    directory: string,
    source: string | GitTransport,
    protocol: "https" | "file" = "https",
  ) {
    this.directory = directory;
    this.url = typeof source === "string" ? source : source.url;
    this.protocol = protocol;
    if (typeof source !== "string") this.transport = source;
    if (/[\x00-\x1f\x7f]/.test(this.url))
      throw new AppError("INVALID_TRANSPORT", "仓库地址不合法。", 400);
    if (protocol === "https" && this.transport) {
      const u = new URL(this.url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        !this.transport.username ||
        /[\x00-\x20\x7f:]/.test(this.transport.username)
      )
        throw new AppError("INVALID_TRANSPORT", "仓库传输配置不合法。", 400);
    }
  }
  private config() {
    const url = this.url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `[core]\nrepositoryformatversion = 0\nfilemode = true\nbare = true\n[remote "origin"]\nurl = "${url}"\n`;
  }
  async run(
    args: string[],
    signal?: AbortSignal,
    inputLimit = 16 * 1024 * 1024,
  ): Promise<Buffer> {
    signal = AbortSignal.any([
      ...(signal ? [signal] : []),
      ...(this.signal ? [this.signal] : []),
    ]);
    if (signal.aborted)
      throw new AppError("GIT_READ_FAILED", "Git 读取已取消。", 503);
    if (this.protocol === "https" && !this.transport)
      throw new AppError(
        "TOKEN_REQUIRED",
        "请连接自己的 GitHub 账号后读取仓库。",
        401,
      );
    const config = await readFile(join(this.directory, "config"), "utf8").catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return null;
        throw e;
      },
    );
    if (config !== null && config !== this.config())
      throw new AppError(
        "GIT_CONFIG_UNTRUSTED",
        "仓库缓存配置不兼容，请重新建立个人缓存。",
      );
    const isolated = await mkdtemp(join(tmpdir(), "openfolio-git-env-"));
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
    for (const key of [
      "PATH",
      "SystemRoot",
      "LANG",
      "LC_ALL",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
      "no_proxy",
      "GIT_SSL_CAINFO",
      "GIT_SSL_CAPATH",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
    ])
      if (process.env[key] !== undefined) env[key] = process.env[key];
    Object.assign(env, {
      HOME: isolated,
      XDG_CONFIG_HOME: isolated,
      CURL_HOME: isolated,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "/bin/false",
      SSH_ASKPASS: "/bin/false",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_TEMPLATE_DIR: isolated,
      GIT_LFS_SKIP_SMUDGE: "1",
    });
    const settings: [string, string][] = [
      ["credential.helper", ""],
      ["core.askPass", "/bin/false"],
      ["http.extraHeader", ""],
      ["http.sslVerify", "true"],
    ];
    if (this.transport)
      settings.push([
        `http.${this.url}.extraHeader`,
        this.transport.secret.use(
          (token) =>
            `Authorization: Basic ${Buffer.from(`${this.transport!.username}:${token}`).toString("base64")}`,
        ),
      ]);
    env.GIT_CONFIG_COUNT = String(settings.length);
    settings.forEach(([key, value], i) => {
      env[`GIT_CONFIG_KEY_${i}`] = key;
      env[`GIT_CONFIG_VALUE_${i}`] = value;
    });
    try {
      const r = await exec(
        "git",
        [
          "-C",
          this.directory,
          "--literal-pathspecs",
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "protocol.allow=never",
          "-c",
          `protocol.${this.protocol}.allow=always`,
          "-c",
          "http.followRedirects=false",
          "-c",
          "credential.interactive=false",
          "-c",
          "gc.auto=0",
          "-c",
          "maintenance.auto=false",
          ...args,
        ],
        {
          env,
          encoding: "buffer",
          maxBuffer: inputLimit,
          timeout: 120_000,
          signal,
        },
      );
      return r.stdout;
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
        throw new AppError(
          "GIT_OUTPUT_LIMIT",
          "Git 读取结果超过展示上限，未返回完整内容。",
          422,
        );
      if (args[0] === "merge-base" && (e as { code?: number }).code === 1)
        return Buffer.from("not-ancestor");
      throw new AppError(
        "GIT_READ_FAILED",
        signal?.aborted
          ? "读取已取消或超时，请重试。"
          : "仓库读取失败，请检查当前连接的权限、网络或存储空间。",
      );
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  }
  async remoteRefs(signal: AbortSignal) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return (
      await this.run(["ls-remote", "--symref", this.url, "HEAD"], signal)
    ).toString();
  }
  async collect(
    limits: Limits,
    signal: AbortSignal,
    integrationBranch: string,
    cache?: { snapshot: Snapshot; readBlob: (blob: string) => Promise<Buffer> },
    routingAttempt = 0,
  ): Promise<CollectedData> {
    if (!validBranchName(integrationBranch))
      throw new AppError("INVALID_PARAMETER", "请指定有效的集成分支。", 400);
    if (
      cache?.snapshot.scanFingerprint !== scanFingerprint(limits) ||
      cache?.snapshot.integrationBranch !== integrationBranch
    )
      cache = undefined;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await access(join(this.directory, "HEAD"));
    } catch {
      await this.run(["init", "--bare", "."], signal);
      await writeFile(join(this.directory, "config"), this.config(), {
        mode: 0o600,
      });
      await chmod(join(this.directory, "config"), 0o600);
    }
    // The Store holds its cache writer lock. Retired tags are no longer a
    // source; remove only the old private namespace with expected object IDs.
    const retired = (
      await this.run(
        [
          "for-each-ref",
          "--format=%(objectname)%09%(refname)",
          "refs/openfolio/archive-v2/",
        ],
        signal,
      )
    )
      .toString()
      .trim();
    for (const row of retired ? retired.split("\n") : []) {
      const [oid, ref] = row.split("\t");
      if (
        !/^[a-f0-9]{40,64}$/.test(oid) ||
        !ref?.startsWith("refs/openfolio/archive-v2/")
      )
        throw new AppError(
          "CACHE_INVALID",
          "旧原型缓存引用不合法，请检查缓存。",
          503,
        );
      await this.run(["update-ref", "-d", ref, oid], signal);
    }
    const previous = cache?.snapshot;
    const branches: Branch[] = [];
    const sourceDiagnostics: Diagnostic[] = [];
    let integrations: Snapshot["integrations"] = {
      version: INTEGRATION_VERSION,
      tip: null,
      complete: false,
      records: {},
      issues: [],
      message: "协作来源尚未就绪。",
    };
    let routes: ChangeRoute[] = [];
    let releaseSource: import("../lib/model.ts").ReleaseSource = {
      branch: null,
      commit: null,
    };
    const diagnostic = (message: string, code = "SETUP_REQUIRED") =>
      sourceDiagnostics.push({ code, message, severity: "warning" });
    const exact = async (names: string[]) => {
      if (!names.length) return new Map<string, string>();
      const rows = (
        await this.run(["ls-remote", "origin", ...names], signal)
      ).toString();
      const requested = new Set(names);
      return new Map(
        rows.split("\n").flatMap((row) => {
          const [commit, ref] = row.split("\t");
          return requested.has(ref) && /^[a-f0-9]{40,64}$/.test(commit)
            ? [[ref, commit] as [string, string]]
            : [];
        }),
      );
    };
    const fetchRef = async (
      remote: string,
      local: string,
      advertised: string,
    ) => {
      // Missing live advertisements never consult residual local refs.
      const found = (
        await this.run(
          ["for-each-ref", "--format=%(objectname)%09%(refname)", local],
          signal,
        )
      )
        .toString()
        .trim()
        .split("\n")
        .some((row) => row === `${advertised}\t${local}`);
      if (!found)
        await this.run(
          [
            "fetch",
            "--no-tags",
            "--no-recurse-submodules",
            "origin",
            `+${remote}:${local}`,
          ],
          signal,
        );
      try {
        return (
          await this.run(["rev-parse", "--verify", `${local}^{commit}`], signal)
        )
          .toString()
          .trim();
      } catch (error) {
        if (remote.startsWith("refs/tags/")) return "";
        throw error;
      }
    };
    const source = async (name: string, advertised?: string) => {
      const existing = branches.find((b) => b.name === name);
      if (existing) return existing;
      if (!advertised) return null;
      if (branches.length >= limits.branches)
        throw new AppError(
          "SOURCE_LIMIT",
          "指定来源数量超过配置限制，已保留上次快照。",
        );
      const branch = {
        name,
        commit: await fetchRef(
          `refs/heads/${name}`,
          `refs/remotes/origin/${name}`,
          advertised,
        ),
      };
      branches.push(branch);
      return branch;
    };
    const documents: DocumentRef[] = [],
      blobs = new Map<string, Buffer>();
    let total = 0;
    const sourceTrees = new Map<string, string>();
    const collectSource = async (
      branch: Branch,
      scope: string[],
      ids?: string[],
      catalogOnly = false,
    ) => {
      const selected = (path: string) =>
        (!catalogOnly ||
          !/^docs\/project\/(changes|archive)\//.test(path) ||
          !!changeLocation(path)) &&
        scope.some(
          (prefix) =>
            path === prefix ||
            (prefix.endsWith("/") && path.startsWith(prefix)),
        ) &&
        (!ids ||
          ids.some(
            (id) =>
              path.startsWith(`docs/project/changes/${id}/`) ||
              new RegExp(
                `^docs/project/archive/[0-9]{4}-[0-9]{2}-[0-9]{2}-${id}/`,
              ).test(path),
          ));
      const prior = previous?.branches.find((b) => b.name === branch.name);
      const priorIds = previous?.routes
        .filter((r) => r.branch === branch.name)
        .map((r) => r.id)
        .sort();
      if (
        cache &&
        prior?.commit === branch.commit &&
        (branch.name === integrationBranch) ===
          (branch.name === previous!.integrationBranch) &&
        (!ids || JSON.stringify(ids.toSorted()) === JSON.stringify(priorIds))
      ) {
        for (const doc of previous!.documents.filter(
          (d) => d.branch === branch.name && selected(d.path),
        )) {
          signal.throwIfAborted();
          if (documents.some((d) => d.id === doc.id)) continue;
          if (documents.length >= limits.documents)
            throw new AppError(
              "SOURCE_LIMIT",
              "文档条目超过配置限制，已保留上次快照。",
            );
          documents.push(doc);
          if (
            doc.kind === "unsupported" ||
            doc.diagnostics.some((d) =>
              ["FILE_MODE", "FILE_SIZE"].includes(d.code),
            ) ||
            blobs.has(doc.blob)
          )
            continue;
          total += doc.bytes;
          if (total > limits.totalBytes)
            throw new AppError(
              "SOURCE_LIMIT",
              "正文总量超过配置限制，已保留上次快照。",
            );
          blobs.set(
            doc.blob,
            await cache
              .readBlob(doc.blob)
              .catch(() =>
                this.run(
                  ["cat-file", "blob", doc.blob],
                  signal,
                  doc.bytes + 1024,
                ),
              ),
          );
        }
        return;
      }
      const treeKey = `${branch.name}:${branch.commit}`;
      const raw =
        sourceTrees.get(treeKey) ??
        (
          await this.run(
            ["ls-tree", "-rz", "--full-tree", branch.commit, "--", ...scope],
            signal,
          )
        ).toString("utf8");
      if (scope.includes("docs/project/")) sourceTrees.set(treeKey, raw);
      for (const row of raw.split("\0")) {
        if (!row) continue;
        const tab = row.indexOf("\t"),
          [mode, kind, blob] = row.slice(0, tab).split(" "),
          path = row.slice(tab + 1);
        if (!safePath(path)) continue;
        if (
          !selected(path) ||
          documents.some((d) => d.branch === branch.name && d.path === path)
        )
          continue;
        if (documents.length >= limits.documents)
          throw new AppError(
            "SOURCE_LIMIT",
            "文档条目超过配置限制，已保留上次快照。",
          );
        const doc: DocumentRef = {
          id: documentId(branch.name, path),
          branch: branch.name,
          commit: branch.commit,
          path,
          blob,
          bytes: 0,
          kind: path.endsWith(".md")
            ? "markdown"
            : path.endsWith(".json")
              ? "json"
              : /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)
                ? "image"
                : "unsupported",
          title: path.split("/").at(-1)!,
          headings: [],
          readable: false,
          diagnostics: [],
        };
        documents.push(doc);
        if (kind !== "blob" || !["100644", "100755"].includes(mode)) {
          doc.diagnostics.push({
            code: "FILE_MODE",
            message: "符号链接和子模块不参与文档读取。",
            path,
            severity: "warning",
          });
          continue;
        }
        if (doc.kind === "unsupported") continue;
        const size = Number(
          (await this.run(["cat-file", "-s", blob], signal)).toString(),
        );
        doc.bytes = size;
        const max =
          doc.kind === "markdown"
            ? limits.markdownBytes
            : doc.kind === "json"
              ? limits.jsonBytes
              : limits.imageBytes;
        if (!Number.isSafeInteger(size) || size > max) {
          doc.diagnostics.push({
            code: "FILE_SIZE",
            message: "文件超过预览大小限制。",
            path,
            severity: "warning",
          });
          continue;
        }
        if (!blobs.has(blob)) {
          total += size;
          if (total > limits.totalBytes)
            throw new AppError(
              "SOURCE_LIMIT",
              "正文总量超过配置限制，已保留上次快照。",
            );
          blobs.set(
            blob,
            await this.run(["cat-file", "blob", blob], signal, max + 1024),
          );
        }
        const buffer = blobs.get(blob)!;
        if (doc.kind === "image") {
          doc.mime = imageMime(buffer);
          doc.readable = !!doc.mime;
          if (!doc.readable)
            doc.diagnostics.push({
              code: "IMAGE_FORMAT",
              message:
                "图片格式无效或不受支持；SVG 需为 UTF-8 XML，且不含 DTD 或处理指令。",
              path,
              severity: "warning",
            });
        } else {
          try {
            const body = new TextDecoder("utf-8", { fatal: true }).decode(
              buffer,
            );
            if (doc.kind === "markdown") {
              const info = inspectMarkdown(body);
              doc.title =
                info.title ??
                path
                  .replace(/^docs\/project\/specs\//, "")
                  .replace(/\/spec.md$/, "");
              doc.headings = info.headings;
            }
            doc.readable = true;
          } catch {
            doc.diagnostics.push({
              code: "TEXT_ENCODING",
              message: "文件不是有效 UTF-8 文本。",
              path,
              severity: "warning",
            });
          }
        }
      }
    };
    const readJson = (branch: string, path: string) => {
      const doc = documents.find((d) => d.branch === branch && d.path === path);
      if (!doc?.readable) throw Error(`无法读取 ${branch}:${path}`);
      return JSON.parse(blobs.get(doc.blob)!.toString());
    };
    const finish = () => {
      branches.sort((a, b) => a.name.localeCompare(b.name));
      const same =
        previous &&
        previous.integrationBranch === integrationBranch &&
        JSON.stringify(previous.branches) === JSON.stringify(branches) &&
        JSON.stringify(previous.routes) === JSON.stringify(routes) &&
        JSON.stringify(previous.releaseSource) ===
          JSON.stringify(releaseSource) &&
        JSON.stringify(previous.sourceDiagnostics) ===
          JSON.stringify(sourceDiagnostics);
      return {
        integrationBranch,
        releaseSource,
        branches,
        routes,
        sourceDiagnostics,
        integrations,
        documents,
        blobs,
        unchanged: !!same,
      };
    };
    const collab = await source(
      integrationBranch,
      (await exact([`refs/heads/${integrationBranch}`])).get(
        `refs/heads/${integrationBranch}`,
      ),
    );
    if (!collab) {
      diagnostic(`集成分支 ${integrationBranch} 不存在，请修复 Setup。`);
      return finish();
    }
    await collectSource(collab, ["docs/project/"], undefined, true);
    let workflow;
    try {
      workflow = workflowCoreSchema.parse(
        readJson(collab.name, "docs/project/workflow.json"),
      );
      if (workflow.integrationBranch !== integrationBranch) throw Error();
    } catch {
      diagnostic(
        "所选集成分支与 workflow.json 配置不一致或配置无效，请修复 Setup。",
      );
      return finish();
    }
    releaseSource = { branch: workflow.releaseBranch, commit: null };
    try {
      const ref = `refs/heads/${workflow.releaseBranch}`;
      const advertised = (await exact([ref])).get(ref);
      if (advertised)
        releaseSource.commit = await fetchRef(
          ref,
          `refs/remotes/origin/${workflow.releaseBranch}`,
          advertised,
        );
      else releaseSource.message = "发布分支尚不存在，发布结果待核实。";
    } catch {
      signal.throwIfAborted();
      releaseSource.message = "发布分支暂不可读取，发布结果待核实。";
    }
    // PR records determine integrations after the known Change catalog is loaded.
    // Fetch complete Git history so PR ancestry and immutable diffs can be verified.
    if (
      (await this.run(["rev-parse", "--is-shallow-repository"], signal))
        .toString()
        .trim() === "true"
    ) {
      await this.run(
        [
          "fetch",
          "--no-tags",
          "--no-recurse-submodules",
          "--unshallow",
          "origin",
          `refs/heads/${integrationBranch}`,
        ],
        signal,
      );
    }
    integrations.tip = collab.commit;
    routes = routeCatalog(
      documents
        .filter((d) => d.branch === integrationBranch && changeLocation(d.path))
        .map((d) => {
          try {
            return { path: d.path, state: readJson(d.branch, d.path) };
          } catch {
            return { path: d.path, state: null, error: "入口 JSON 不可读。" };
          }
        }),
      integrationBranch,
      workflow.releaseBranch,
    ) as ChangeRoute[];
    const routingIdentity = JSON.stringify(routes);
    const centralIds = routes
      .filter((r) => r.branch === integrationBranch && !r.errors.length)
      .map((r) => r.id);
    if (centralIds.length)
      await collectSource(
        collab,
        ["docs/project/changes/", "docs/project/archive/"],
        centralIds,
      );
    const targets = [
      ...new Set(
        routes
          .filter((r) => r.kind === "target" && !r.errors.length)
          .map((r) => r.branch!),
      ),
    ].sort();
    if (targets.length + branches.length > limits.branches)
      throw new AppError(
        "SOURCE_LIMIT",
        "指定来源数量超过配置限制，已保留上次快照。",
      );
    const refs = await exact(targets.map((name) => `refs/heads/${name}`));
    const parentIds = new Set(
      routes
        .filter((r) => r.kind === "target")
        .map((r) => r.parent)
        .filter(Boolean),
    );
    const parentNames = new Set(
      routes
        .filter((r) => parentIds.has(r.id) && r.kind === "target")
        .map((r) => r.branch!),
    );
    const loadTargets = async (names: string[], parents = false) => {
      for (const name of names) {
        const targetRoutes = routes.filter(
          (r) => r.branch === name && !r.errors.length,
        );
        if (!targetRoutes.length) continue;
        const target = await source(name, refs.get(`refs/heads/${name}`));
        const ids = targetRoutes.map((r) => r.id);
        if (parents)
          ids.push(
            ...routes
              .filter((r) => r.parent && ids.includes(r.parent))
              .map((r) => r.id),
          );
        if (target)
          await collectSource(
            target,
            ["docs/project/changes/", "docs/project/archive/"],
            ids,
          );
        for (const route of targetRoutes) {
          const previousGroup = previous?.changes.find(
            (group) => group.id === route.id,
          );
          const wasOwned = previousGroup?.candidates.some(
            (candidate) =>
              candidate.key === previousGroup.primary &&
              candidate.branch === name &&
              candidate.owner === name,
          );
          const ownership = sourceOwnership(
            sourceRecords(name),
            route.id,
            name,
          );
          const entry = sourceRecords(integrationBranch).find(
            (row) => row.id === route.id,
          );
          if (!target && wasOwned) {
            route.errors.push(
              `登记的远端工作分支 ${name} 不存在；不采用集中旧副本。`,
            );
            continue;
          }
          const resolved = resolvePlanningRoute(
            route,
            entry?.state,
            ownership,
            integrationBranch,
          );
          Object.assign(route, resolved);
          if (route.kind === "planning")
            await collectSource(collab, ["docs/project/changes/"], [route.id]);
          else if (!target)
            route.errors.push(
              `登记的远端工作分支 ${name} 不存在；不采用集中旧副本。`,
            );
        }
      }
    };
    const sourceRecords = (name: string) =>
      documents.flatMap((d) => {
        const location = changeLocation(d.path);
        if (d.branch !== name || !location) return [];
        try {
          return [
            {
              ...location,
              path: d.path,
              state: readJson(name, d.path),
              error: undefined as string | undefined,
            },
          ];
        } catch {
          return [
            {
              ...location,
              path: d.path,
              state: null,
              error: "来源 JSON 不可读",
            },
          ];
        }
      });
    await loadTargets([...parentNames], true);
    for (const route of routes.filter(
      (r) => r.kind === "target" && r.parent && !r.errors.length,
    )) {
      try {
        const parentRoute = routes.find((r) => r.id === route.parent);
        const centralChild = sourceRecords(integrationBranch).find(
          (row) => row.id === route.id,
        )?.state;
        if (
          parentRoute?.kind === "planning" &&
          planningRecord(centralChild) &&
          !refs.has(`refs/heads/${route.branch}`)
        )
          continue;
        if (
          !parentRoute?.branch ||
          parentRoute.parent ||
          parentRoute.errors.length
        )
          throw Error("父 Change 来源不可读或存在嵌套关系。");
        const parentRows = sourceRecords(parentRoute.branch).filter(
          (r) => r.id === route.parent,
        );
        if (parentRows.length !== 1) throw Error("父 Change 来源不唯一。");
        const parent = changeSchema.parse(parentRows[0].state);
        const child = sourceRecords(integrationBranch).find(
          (r) => r.id === route.id,
        )!.state;
        parentBranch(child, parent, integrationBranch, workflow.releaseBranch);
        const archive = parentArchive(
          sourceRecords(parentRoute.branch),
          child,
          parent,
        );
        if (archive) {
          changeSchema.parse(archive.state);
          route.ownerBranch = route.branch!;
          route.branch = parentRoute.branch;
          route.kind = "archive";
        }
      } catch (error) {
        route.errors.push(
          error instanceof Error ? error.message : "父 Change 归档无法读取。",
        );
      }
    }
    await loadTargets(targets.filter((name) => !parentNames.has(name)));
    // Recheck only the selected collaboration source and its routing.
    const finalCollabCommit = (
      await exact([`refs/heads/${integrationBranch}`])
    ).get(`refs/heads/${integrationBranch}`);
    let changed = !finalCollabCommit;
    const catalogAt = async (commit: string, entries: boolean) => {
      const rows = (
        await this.run(
          [
            "ls-tree",
            "-rlz",
            "--full-tree",
            commit,
            "--",
            "docs/project/workflow.json",
            ...(entries
              ? ["docs/project/changes/", "docs/project/archive/"]
              : []),
          ],
          signal,
        )
      )
        .toString()
        .split("\0");
      let config: unknown;
      const records: { path: string; state: unknown; error?: string }[] = [];
      for (const row of rows) {
        const tab = row.indexOf("\t");
        if (tab < 0) continue;
        const path = row.slice(tab + 1),
          isConfig = path === "docs/project/workflow.json";
        if (!isConfig && !changeLocation(path)) continue;
        const [mode, kind, blob, size] = row.slice(0, tab).trim().split(/\s+/);
        let state: unknown = null,
          error;
        try {
          if (
            kind !== "blob" ||
            !["100644", "100755"].includes(mode) ||
            !Number.isSafeInteger(Number(size)) ||
            Number(size) > limits.jsonBytes
          )
            throw Error();
          const cached = blobs.get(blob);
          state = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              cached ??
                (await this.run(
                  ["cat-file", "blob", blob],
                  signal,
                  limits.jsonBytes + 1024,
                )),
            ),
          );
        } catch {
          error = "入口 JSON 不可读。";
        }
        if (isConfig) config = state;
        else records.push({ path, state, ...(error ? { error } : {}) });
      }
      return { config, records };
    };
    if (!changed && finalCollabCommit !== collab.commit) {
      const commit = await fetchRef(
        `refs/heads/${collab.name}`,
        `refs/remotes/origin/${collab.name}`,
        finalCollabCommit!,
      );
      const current = await catalogAt(commit, true),
        probe = workflowCoreSchema.safeParse(current.config);
      changed =
        !probe.success ||
        JSON.stringify(probe.data) !== JSON.stringify(workflow) ||
        JSON.stringify(
          routeCatalog(
            current.records,
            integrationBranch,
            workflow.releaseBranch,
          ),
        ) !== routingIdentity;
    }
    if (changed) {
      if (routingAttempt < 2)
        return this.collect(
          limits,
          signal,
          integrationBranch,
          cache,
          routingAttempt + 1,
        );
      throw new AppError(
        "SOURCE_CHANGED",
        "协作入口或配置在读取中持续变化，请重试；上次快照已保留。",
      );
    }
    return finish();
  }
  // Inspect additions across all parents: merge resolutions can introduce records too.
  // Group active and archived paths by stable ID so moving a Change never resets it.
  // 首次加入 change.json 的时间与作者；作者邮箱只交给调用方识别平台登录名，不进入快照。
  async changeCreations(commits: string[], signal?: AbortSignal) {
    const created = new Map<
      string,
      { time: number; author: { name: string; email: string } }
    >();
    if (!commits.length) return created;
    const history = await this.run(
      [
        "log",
        "--full-history",
        "--root",
        "-m",
        "--no-renames",
        "--diff-filter=A",
        "--format=%x00%ct%x00%an%x00%ae",
        "--name-only",
        ...new Set(commits),
        "--",
        "docs/project/changes",
        "docs/project/archive",
      ],
      signal,
    );
    let time = NaN,
      author = { name: "", email: "" };
    for (const line of history.toString().split("\n")) {
      if (line.startsWith("\0")) {
        const [, seconds, name = "", email = ""] = line.split("\0");
        time = Number(seconds) * 1000;
        author = { name, email };
        continue;
      }
      const match =
        /^docs\/project\/(?:changes\/|archive\/\d{4}-\d{2}-\d{2}-)([a-z0-9]+(?:-[a-z0-9]+)*)\/change\.json$/.exec(
          line,
        );
      if (!match || !Number.isFinite(time)) continue;
      const prior = created.get(match[1]);
      if (!prior || time < prior.time) created.set(match[1], { time, author });
    }
    return created;
  }
  async ancestor(base: string, tip: string, signal?: AbortSignal) {
    try {
      return (
        (await this.run(["merge-base", "--is-ancestor", base, tip], signal))
          .length === 0
      );
    } catch {
      return false;
    }
  }
}
