import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { dataDirectory } from "./config.ts";
import { AppError } from "./errors.ts";
import { ThumbnailCache } from "./thumbnail-cache.ts";
import { previewViewport } from "../lib/preview-viewport.ts";
import type { ReadContext } from "./repositories.ts";
import type { Limits, PreviewDescriptor } from "../lib/model.ts";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const httpUrl = z
  .string()
  .url()
  .refine(
    (v) =>
      ["http:", "https:"].includes(new URL(v).protocol) &&
      !new URL(v).username &&
      !new URL(v).password,
  );
const schema = z
  .object({
    schemaVersion: z.literal(1),
    id: hex,
    title: z.string().max(1024),
    kind: z.enum(["page", "component"]),
    devices: z.array(z.enum(["pc-web", "ipad", "mobile"])).optional(),
    viewport: z
      .object({
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
      })
      .optional(),
    revision: z.string().regex(/^[a-f0-9]{40,64}$/),
    digest: z.string(),
    type: z.enum(["git", "hosted"]),
    url: httpUrl.optional(),
    thumbnails: z
      .array(
        z.object({
          device: z.enum(["pc-web", "ipad", "mobile"]).optional(),
          url: httpUrl,
        }),
      )
      .optional(),
    files: z.record(
      z
        .string()
        .regex(/^(?:index\.html|(?:pc-web|ipad|mobile|component)\.jpg)$/),
      z.object({ hash: hex, bytes: z.number().int().nonnegative() }),
    ),
  })
  .strict();
export type PublicPreview = z.infer<typeof schema>;
export type PrepareInput = {
  change?: string;
  revision?: string;
  snapshot?: string;
  entry: string;
};
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export class PublicPreviews {
  root: string;
  screenshots: ThumbnailCache;
  constructor(
    root: string,
    screenshots = new ThumbnailCache(join(root, "screenshots")),
  ) {
    this.root = root;
    this.screenshots = screenshots;
  }
  private directory(id: string) {
    if (!hex.safeParse(id).success)
      throw new AppError(
        "PREVIEW_NOT_READY",
        "这个原型尚未准备公开版本。",
        404,
      );
    return join(this.root, "versions", id);
  }
  async get(id: string): Promise<PublicPreview> {
    const dir = this.directory(id);
    if (
      await readFile(join(dir, "withdrawn")).then(
        () => true,
        () => false,
      )
    )
      throw new AppError(
        "PREVIEW_WITHDRAWN",
        "此公开原型已由部署者撤回。",
        410,
      );
    try {
      const value = schema.parse(
        JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")),
      );
      if (value.id !== id) throw Error();
      return value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw new AppError(
          "PREVIEW_NOT_READY",
          "这个原型尚未准备公开版本。",
          404,
        );
      throw new AppError("PREVIEW_CORRUPT", "公开原型文件不完整。", 503);
    }
  }
  async asset(id: string, path: string) {
    const meta = await this.get(id);
    if (meta.type === "hosted" && path === "index.html")
      return { meta, redirect: meta.url!, body: undefined };
    const file = Object.hasOwn(meta.files, path) ? meta.files[path] : undefined;
    if (!file)
      throw new AppError("ASSET_NOT_FOUND", "原型资源未在公开清单中。", 404);
    const body = await readFile(join(this.directory(id), path)).catch(() => {
      throw new AppError("PREVIEW_CORRUPT", "公开原型文件不完整。", 503);
    });
    if (body.length !== file.bytes || digest(body) !== file.hash)
      throw new AppError("PREVIEW_CORRUPT", "公开原型摘要校验失败。", 503);
    return { meta, body, redirect: undefined };
  }
  async withdraw(id: string) {
    await this.get(id);
    await writeFile(
      join(this.directory(id), "withdrawn"),
      new Date().toISOString(),
      { mode: 0o600, flag: "wx" },
    );
  }
  private aliasPath(key: string, input: PrepareInput) {
    return join(
      this.root,
      "aliases",
      digest(
        JSON.stringify([key, input.revision, input.change ?? "", input.entry]),
      ),
    );
  }
  private async alias(key: string, input: PrepareInput, meta: PublicPreview) {
    await mkdir(join(this.root, "aliases"), { recursive: true, mode: 0o700 });
    const path = this.aliasPath(key, { ...input, revision: meta.revision });
    await writeFile(path, meta.id, { flag: "wx", mode: 0o600 }).catch(
      async (e: NodeJS.ErrnoException) => {
        if (e.code !== "EEXIST" || (await readFile(path, "utf8")) !== meta.id)
          throw e;
      },
    );
  }
  async resolveAlias(key: string, input: PrepareInput) {
    const id = await readFile(this.aliasPath(key, input), "utf8").catch(
      () => "",
    );
    return this.get(id);
  }
  async prepare(context: ReadContext, input: PrepareInput, limits: Limits) {
    const { store, project } = context;
    const result = input.change
      ? await store.preview(
          project,
          input.change,
          input.revision,
          limits,
          input.snapshot,
          input.entry,
          true,
        )
      : await store.currentPreview(
          project,
          input.revision,
          limits,
          input.snapshot,
          input.entry,
          true,
        );
    const entry = result.descriptor.entries.find((e) => e.id === input.entry);
    if (!entry?.available || !entry.artifact || !result.descriptor.revision)
      throw new AppError(
        "PREVIEW_UNAVAILABLE",
        entry?.message ?? result.descriptor.message ?? "原型尚未登记有效产物。",
        409,
      );
    const artifact = entry.artifact;
    if (artifact.type === "git" && result.html === undefined)
      throw new AppError("PREVIEW_UNAVAILABLE", "Git 原型正文不可读。", 409);
    const contentDigest =
      artifact.type === "git"
        ? `sha256:${digest(result.html!)}`
        : artifact.digest;
    const id = digest(
      JSON.stringify([
        1,
        project.id,
        result.descriptor.revision,
        input.change ?? "",
        entry.id,
        artifact,
        contentDigest,
      ]),
    );
    await context.assertRead();
    try {
      const existing = await this.get(id);
      await this.alias(project.id, input, existing);
      return existing;
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "PREVIEW_NOT_READY") throw e;
    }
    const directory = this.directory(id),
      temporary = join(this.root, "versions", `.${randomUUID()}.tmp`);
    await mkdir(temporary, { recursive: true, mode: 0o700 });
    try {
      const files: PublicPreview["files"] = {};
      const put = async (path: string, body: Buffer) => {
        files[path] = { hash: digest(body), bytes: body.length };
        await writeFile(join(temporary, path), body, {
          mode: 0o600,
          flag: "wx",
        });
      };
      if (artifact.type === "git") {
        await put("index.html", Buffer.from(result.html!));
        for (const device of entry.devices ?? [undefined]) {
          context.lease.context.signal.throwIfAborted();
          const { viewport } = previewViewport(entry, device);
          const image = await this.screenshots.get(id, result.html!, viewport);
          await put(`${device ?? "component"}.jpg`, image.body);
        }
      }
      const meta: PublicPreview = schema.parse({
        schemaVersion: 1,
        id,
        title: entry.title,
        kind: entry.kind,
        devices: entry.devices,
        viewport: entry.viewport,
        revision: result.descriptor.revision,
        digest: contentDigest,
        type: artifact.type,
        files,
        ...(artifact.type === "hosted"
          ? { url: artifact.url, thumbnails: artifact.thumbnails }
          : {}),
      });
      await writeFile(join(temporary, "manifest.json"), JSON.stringify(meta), {
        mode: 0o600,
        flag: "wx",
      });
      await context.assertRead();
      try {
        await rename(temporary, directory);
      } catch (e) {
        if (
          !["EEXIST", "ENOTEMPTY"].includes(
            (e as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw e;
        const existing = await this.get(id);
        if (JSON.stringify(existing) !== JSON.stringify(meta))
          throw new AppError(
            "PUBLICATION_CONFLICT",
            "固定版本已存在不同内容。",
            409,
          );
      }
      await this.alias(project.id, input, meta);
      return meta;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
const publicState = globalThis as typeof globalThis & {
  folioPublicPreviews?: Map<string, PublicPreviews>;
};
export function publicPreviews(): PublicPreviews {
  const root = join(dataDirectory(), "public-previews");
  const stores = (publicState.folioPublicPreviews ??= new Map());
  let service = stores.get(root);
  if (!service) {
    service = new PublicPreviews(root);
    stores.set(root, service);
  }
  return service;
}
export const publicPreviewUrl = (id: string) => `/preview/${id}`;
export function publicEntry(
  meta: PublicPreview,
): PreviewDescriptor["entries"][number] {
  return {
    id: meta.id,
    title: meta.title,
    kind: meta.kind,
    devices: meta.devices,
    viewport: meta.viewport,
    available: true,
    url: `/api/public-previews/${meta.id}/index.html`,
    thumbnails:
      meta.type === "hosted"
        ? meta.thumbnails
        : (meta.devices ?? [undefined]).map((device) => ({
            device,
            url: `/api/public-previews/${meta.id}/${device ?? "component"}.jpg`,
          })),
  };
}
