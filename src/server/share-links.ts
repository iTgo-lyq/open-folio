import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  SHARE_READING_KEYS,
  shareParams,
  type ShareTarget,
  type ShareLocation,
} from "../lib/share-link.ts";
import { dataDirectory } from "./config.ts";
import { AppError } from "./errors.ts";

const targetSchema = z
  .object({
    repository: z.string().url(),
    change: z.string().min(1),
    integrationBranch: z.string().min(1),
    location: z
      .record(z.enum(SHARE_READING_KEYS), z.string().min(1).max(4096))
      .optional(),
  })
  .strict();
const missing = () =>
  new AppError("SHARE_LINK_NOT_FOUND", "分享链接不存在。", 404);

// These immutable records are durable data, independent of repository caches.
export class ShareLinks {
  readonly directory: string;
  constructor(root = dataDirectory()) {
    this.directory = join(root, "share-links");
  }
  async prepare(target: ShareTarget, location: ShareLocation = {}) {
    const parsed = targetSchema.safeParse({
      ...Object.fromEntries(shareParams(target)),
      ...(Object.keys(location).length ? { location } : {}),
    });
    if (!parsed.success)
      throw new AppError("INVALID_PARAMETER", "分享阅读位置不合法。", 400);
    const value = parsed.data;
    const body = JSON.stringify(value) + "\n";
    const id = createHash("sha256")
      .update(body)
      .digest("base64url")
      .slice(0, 22);
    const path = join(this.directory, `${id}.json`);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, body, { flag: "wx", mode: 0o600 });
      await link(temporary, path).catch(
        async (error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
          if ((await readFile(path, "utf8")) !== body)
            throw new AppError(
              "SHARE_LINK_CONFLICT",
              "分享链接保存失败，请稍后重试。",
              500,
            );
        },
      );
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    return { ...value, shortId: id };
  }
  async read(id: string): Promise<ShareTarget> {
    if (!/^[A-Za-z0-9_-]{22}$/.test(id)) throw missing();
    let body: string;
    try {
      body = await readFile(join(this.directory, `${id}.json`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw missing();
      throw error;
    }
    return { ...targetSchema.parse(JSON.parse(body)), shortId: id };
  }
}
