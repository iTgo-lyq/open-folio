import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { atomicPrivate } from "./personal-sessions.ts";
import { AppError } from "./errors.ts";
import { dataDirectory } from "./config.ts";
import { validBranchName } from "../lib/collaboration.ts";

export const shareId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const recordSchema = z
  .object({
    id: shareId,
    accountId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    repository: z
      .object({
        providerId: z.string().min(1).max(128),
        instanceId: z.string().min(1).max(255),
        repositoryId: z.string().min(1).max(128),
        fullName: z.string().min(1).max(256),
      })
      .strict(),
    collaborationBranch: z.string().refine(validBranchName),
    changeId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    createdAt: z.string().datetime(),
    revokedAt: z.string().datetime().optional(),
  })
  .strict();
const schema = z
  .object({
    schemaVersion: z.literal(1),
    records: z.array(recordSchema).max(10_000),
  })
  .strict();
export type ShareRecord = z.infer<typeof recordSchema>;
export type ShareScope = Omit<ShareRecord, "id" | "createdAt" | "revokedAt">;
const globalState = globalThis as typeof globalThis & {
  folioShareWrites?: Map<string, Promise<unknown>>;
};
const missing = () => new AppError("SHARE_NOT_FOUND", "分享链接不存在。", 404);
const sameScope = (a: ShareScope, b: ShareScope) =>
  a.accountId === b.accountId &&
  a.workspaceId === b.workspaceId &&
  a.repository.providerId === b.repository.providerId &&
  a.repository.instanceId === b.repository.instanceId &&
  a.repository.repositoryId === b.repository.repositoryId &&
  a.collaborationBranch === b.collaborationBranch &&
  a.changeId === b.changeId;

export class Shares {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private async load() {
    let raw: string;
    try {
      raw = await readFile(join(this.root, "state.json"), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { schemaVersion: 1 as const, records: [] as ShareRecord[] };
      throw e;
    }
    try {
      const state = schema.parse(JSON.parse(raw));
      if (new Set(state.records.map((r) => r.id)).size !== state.records.length)
        throw Error();
      return state;
    } catch {
      throw new AppError(
        "SHARE_DATA_INVALID",
        "分享数据不可读，原数据已保留。",
      );
    }
  }
  private async write<T>(
    operation: (state: z.infer<typeof schema>) => T | Promise<T>,
  ): Promise<T> {
    const locks = (globalState.folioShareWrites ??= new Map());
    const next = (locks.get(this.root) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const state = await this.load();
        const result = await operation(state);
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await atomicPrivate(
          join(this.root, "state.json"),
          JSON.stringify(schema.parse(state)),
        );
        return result;
      });
    locks.set(this.root, next);
    try {
      return await next;
    } finally {
      if (locks.get(this.root) === next) locks.delete(this.root);
    }
  }
  async get(id: string) {
    if (!shareId.safeParse(id).success) throw missing();
    const record = (await this.load()).records.find((r) => r.id === id);
    if (!record) throw missing();
    if (record.revokedAt)
      throw new AppError("SHARE_REVOKED", "分享已停止，请联系分享者。", 410);
    return record;
  }
  async find(scope: ShareScope) {
    return (
      (await this.load()).records.find(
        (r) => !r.revokedAt && sameScope(r, scope),
      ) ?? null
    );
  }
  async create(scope: ShareScope, assertCurrent: () => Promise<void>) {
    return this.write(async (state) => {
      await assertCurrent();
      const existing = state.records.find(
        (r) => !r.revokedAt && sameScope(r, scope),
      );
      if (existing) return { record: existing, created: false };
      if (state.records.length >= 10_000)
        throw new AppError("SHARE_LIMIT", "分享记录已达到服务容量。", 409);
      const record = recordSchema.parse({
        ...scope,
        id: randomBytes(32).toString("base64url"),
        createdAt: new Date().toISOString(),
      });
      state.records.push(record);
      return { record, created: true };
    });
  }
  async revoke(
    id: string,
    accountId: string,
    assertCurrent: () => Promise<void> = async () => {},
  ) {
    return this.write(async (state) => {
      await assertCurrent();
      const record = state.records.find(
        (r) => r.id === id && r.accountId === accountId,
      );
      if (!record) throw missing();
      record.revokedAt ??= new Date().toISOString();
    });
  }
}
export const shares = () => new Shares(join(dataDirectory(), "shares"));
