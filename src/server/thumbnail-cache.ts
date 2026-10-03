import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  stat,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { AppError } from "./errors.ts";
import {
  renderThumbnail,
  THUMBNAIL_VERSION,
  type ThumbnailViewport,
} from "./thumbnail-renderer.ts";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Result = { body: Buffer; etag: string; cached: boolean };
type Waiter = { start: () => void; timer: ReturnType<typeof setTimeout> };
const defaults = {
  concurrency: 2,
  queued: 24,
  queueMs: 30_000,
  bytes: 100 * 1024 * 1024,
  ageMs: 7 * 86400_000,
  failureMs: 5_000,
};

export class ThumbnailCache {
  private pending = new Map<string, Promise<Result>>();
  private failures = new Map<string, { until: number; error: unknown }>();
  private active = 0;
  private queue: Waiter[] = [];
  private cleanup: Promise<void> = Promise.resolve();
  private options: typeof defaults;
  private root: string;
  private render: typeof renderThumbnail;
  constructor(
    root: string,
    render = renderThumbnail,
    options: Partial<typeof defaults> = {},
  ) {
    this.root = root;
    this.render = render;
    this.options = { ...defaults, ...options };
  }

  get(
    namespace: string,
    html: string,
    viewport: ThumbnailViewport,
  ): Promise<Result> {
    const key = digest(
      JSON.stringify([
        THUMBNAIL_VERSION,
        namespace,
        digest(html),
        viewport.width,
        viewport.height,
      ]),
    );
    const running = this.pending.get(key);
    if (running) return running;
    const task = this.load(key, html, viewport).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, task);
    return task;
  }
  private async acquire() {
    if (this.active < this.options.concurrency) {
      this.active++;
      return;
    }
    if (this.queue.length >= this.options.queued)
      throw new AppError("THUMBNAIL_BUSY", "截图正在生成，请稍后重试。", 503);
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        start: resolve,
        timer: setTimeout(() => {
          this.queue = this.queue.filter((item) => item !== waiter);
          reject(
            new AppError("THUMBNAIL_BUSY", "截图排队超时，请稍后重试。", 503),
          );
        }, this.options.queueMs),
      };
      this.queue.push(waiter);
    });
  }
  private release() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.start();
    } else this.active--;
  }
  private async load(
    key: string,
    html: string,
    viewport: ThumbnailViewport,
  ): Promise<Result> {
    const path = join(this.root, `${key}.jpg`);
    const etag = `"${key}"`;
    try {
      const info = await stat(path);
      if (
        info.size <= MAX_IMAGE_BYTES &&
        Date.now() - info.mtimeMs < this.options.ageMs
      ) {
        const body = await readFile(path);
        if (body[0] === 0xff && body[1] === 0xd8) {
          await utimes(path, new Date(), new Date()).catch(() => {});
          return { body, etag, cached: true };
        }
      }
    } catch {
      /* Rebuild missing or incomplete derived data. */
    }
    const failure = this.failures.get(key);
    if (failure && failure.until > Date.now()) throw failure.error;
    await this.acquire();
    try {
      const body = await this.render(html, viewport);
      if (body.length > MAX_IMAGE_BYTES || body[0] !== 0xff || body[1] !== 0xd8)
        throw new AppError(
          "THUMBNAIL_SIZE",
          "截图超过大小限制，仍可打开原型预览。",
          413,
        );
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, body, { mode: 0o600 });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      this.failures.delete(key);
      this.cleanup = this.cleanup.catch(() => {}).then(() => this.prune());
      await this.cleanup;
      return { body, etag, cached: false };
    } catch (error) {
      this.failures.set(key, {
        until: Date.now() + this.options.failureMs,
        error,
      });
      while (this.failures.size > 128)
        this.failures.delete(this.failures.keys().next().value!);
      throw error;
    } finally {
      this.release();
    }
  }
  private async prune() {
    const files = await Promise.all(
      (await readdir(this.root))
        .filter((name) => /^[a-f0-9]{64}\.jpg$/.test(name))
        .map(async (name) => {
          const path = join(this.root, name);
          const info = await stat(path).catch(() => null);
          return info && { path, size: info.size, time: info.mtimeMs };
        }),
    );
    const ordered = files
      .filter((file) => !!file)
      .sort((a, b) => b.time - a.time);
    let size = 0;
    for (const file of ordered) {
      size += file.size;
      if (
        size > this.options.bytes ||
        Date.now() - file.time >= this.options.ageMs
      )
        await unlink(file.path).catch(() => {});
    }
  }
}
