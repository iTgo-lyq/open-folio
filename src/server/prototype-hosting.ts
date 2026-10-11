import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { dataDirectory } from "./config.ts";
import { privateSecret, requireAdmin } from "./access.ts";
import { AppError, publicError } from "./errors.ts";
import { safePath } from "../../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import {
  digestPrefix,
  uploadType,
  uploadMagic,
  maxHeaderBytes,
  validateUpload,
} from "../../.agents/skills/spec-trail/prototype/scripts/upload-protocol.mjs";

type Publication = {
  request: {
    schemaVersion: 1;
    requestId: string;
    repository: string;
    sourceCommit: string;
    artifactDirectory: string;
    digest: string;
    entries: { id: string; entryPath: string; hash?: string }[];
  };
  files: { path: string; size: number }[];
};
type StoredPublication = Publication & { hashes: Record<string, string> };
const digest = (value: string) => createHash("sha256").update(value).digest();
const uploadKeyPath = () => join(dataDirectory(), "prototype-upload-key");
const storageRoot = () => join(dataDirectory(), "prototype-artifacts");
const noStore = { "Cache-Control": "private, no-store" };
const invalid = () =>
  new AppError("UPLOAD_INVALID", "上传内容、文件路径或摘要不合法。", 400);
const failure = (e: unknown) => {
  const error = publicError(e);
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: noStore },
  );
};
export async function hostingInfo(request: Request) {
  try {
    await requireAdmin(request);
    const key = await privateSecret(uploadKeyPath());
    await requireAdmin(request);
    return Response.json(
      { uploadPath: `/api/prototype-uploads/${key}` },
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
async function checkUploadKey(key: string) {
  const actual = await readFile(uploadKeyPath(), "utf8").catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return "";
      throw e;
    },
  );
  if (
    !actual.trim() ||
    key.length > 256 ||
    !timingSafeEqual(digest(actual.trim()), digest(key))
  )
    throw new AppError("UPLOAD_DENIED", "上传地址无效，请向管理员获取。", 401);
}

// Reads only the requested bytes, with bounded header memory and streaming file writes.
class UploadReader {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  buffered: Uint8Array = new Uint8Array(0);
  done = false;
  signal: AbortSignal;
  constructor(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
    this.reader = body.getReader();
    this.signal = signal;
    signal.addEventListener("abort", this.cancel, { once: true });
  }
  cancel = () => {
    void this.reader.cancel().catch(() => {});
  };
  async chunk(max: number): Promise<Uint8Array> {
    this.signal.throwIfAborted();
    while (!this.buffered.length && !this.done) {
      const next = await this.reader.read();
      this.done = !!next.done;
      this.buffered = next.value ?? new Uint8Array(0);
      this.signal.throwIfAborted();
    }
    const chunk = this.buffered.subarray(0, max);
    this.buffered = this.buffered.subarray(chunk.length);
    return chunk;
  }
  async exact(size: number) {
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const chunk = await this.chunk(size - offset);
      if (!chunk.length) throw invalid();
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
  close() {
    this.signal.removeEventListener("abort", this.cancel);
    this.cancel();
  }
}
const globals = globalThis as typeof globalThis & { openfolioUploads?: number };

export async function uploadPublication(request: Request, key: string) {
  let staging: string | undefined,
    input: UploadReader | undefined,
    active = false;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 120_000);
  timer.unref();
  const signal = AbortSignal.any([request.signal, timeout.signal]);
  try {
    await checkUploadKey(key);
    if (request.headers.get("content-type")?.split(";")[0] !== uploadType)
      throw new AppError("UPLOAD_TYPE", "请使用 OpenFolio 原型上传命令。", 415);
    if (!request.body) throw invalid();
    if ((globals.openfolioUploads ?? 0) >= 2)
      throw new AppError("UPLOAD_BUSY", "上传繁忙，请稍后重试。", 429);
    globals.openfolioUploads = (globals.openfolioUploads ?? 0) + 1;
    active = true;
    input = new UploadReader(request.body, signal);
    if (!(await input.exact(uploadMagic.length)).equals(uploadMagic))
      throw invalid();
    const size = (await input.exact(4)).readUInt32BE();
    if (!size || size > maxHeaderBytes) throw invalid();
    let publication: Publication;
    try {
      publication = JSON.parse((await input.exact(size)).toString("utf8"));
      validateUpload(publication);
    } catch {
      throw invalid();
    }
    const root = storageRoot();
    await mkdir(root, { recursive: true, mode: 0o700 });
    staging = await mkdtemp(join(root, ".upload-"));
    const hash = createHash("sha256"),
      hashes: Record<string, string> = Object.create(null);
    for (const file of publication.files) {
      const path = join(staging, "files", file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const handle = await open(path, "wx", 0o600);
      const fileHash = createHash("sha256");
      hash.update(digestPrefix(file.path, file.size));
      try {
        let remaining = file.size;
        while (remaining) {
          const chunk = await input.chunk(Math.min(remaining, 64 * 1024));
          if (!chunk.length) throw invalid();
          await handle.writeFile(chunk);
          hash.update(chunk);
          fileHash.update(chunk);
          remaining -= chunk.length;
        }
      } finally {
        await handle.close();
      }
      hashes[file.path] = fileHash.digest("hex");
    }
    if (
      (await input.chunk(1)).length ||
      `sha256:${hash.digest("hex")}` !== publication.request.digest
    )
      throw invalid();
    const stored: StoredPublication = { ...publication, hashes };
    const metadata = JSON.stringify(stored);
    await writeFile(join(staging, "publication.json"), metadata, {
      flag: "wx",
      mode: 0o600,
    });
    signal.throwIfAborted();
    await checkUploadKey(key);
    const version = publication.request.requestId,
      target = join(root, version);
    try {
      await rename(staging, target);
    } catch (e) {
      if (
        !["EEXIST", "ENOTEMPTY"].includes(
          (e as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw e;
      const prior = await readPublication(version);
      // artifactDirectory is client-local and is not part of the request identity.
      if (
        prior.request.requestId !== version ||
        prior.request.digest !== publication.request.digest ||
        JSON.stringify(prior.files) !== JSON.stringify(publication.files)
      )
        throw invalid();
      for (const file of prior.files) {
        const bytes = await readStoredFile(version, file);
        if (
          createHash("sha256").update(bytes).digest("hex") !== hashes[file.path]
        )
          throw new AppError(
            "UPLOAD_COLLISION",
            "已有固定版本内容不一致，拒绝覆盖。",
            409,
          );
      }
    }
    await checkUploadKey(key);
    return Response.json(
      {
        schemaVersion: 1,
        status: "published",
        requestId: version,
        sourceCommit: publication.request.sourceCommit,
        digest: publication.request.digest,
        version,
        entries: publication.request.entries.map((entry) => ({
          id: entry.id,
          path: `prototype-assets/${version}/${entry.entryPath}${entry.hash ?? ""}`,
        })),
      },
      { headers: noStore },
    );
  } catch (e) {
    return failure(
      signal.aborted
        ? new AppError("UPLOAD_TIMEOUT", "上传已中断或超时，请重试。", 408)
        : e,
    );
  } finally {
    clearTimeout(timer);
    input?.close();
    if (staging)
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (active) globals.openfolioUploads = (globals.openfolioUploads ?? 1) - 1;
  }
}

async function regularPath(version: string, path: string) {
  if (!/^[a-f0-9]{64}$/.test(version) || !safePath(path)) throw invalid();
  let at = storageRoot();
  const parts = [version, ...path.split("/")];
  for (const [i, part] of parts.entries()) {
    at = join(at, part);
    const stat = await lstat(at);
    if (
      stat.isSymbolicLink() ||
      !(i === parts.length - 1 ? stat.isFile() : stat.isDirectory())
    )
      throw invalid();
  }
  return at;
}
async function readPublication(version: string): Promise<StoredPublication> {
  const path = await regularPath(version, "publication.json");
  const stat = await lstat(path);
  if (stat.size > 3 * maxHeaderBytes) throw invalid();
  const stored = JSON.parse(await readFile(path, "utf8"));
  validateUpload({ request: stored.request, files: stored.files });
  if (
    stored.request.requestId !== version ||
    !stored.hashes ||
    typeof stored.hashes !== "object"
  )
    throw invalid();
  return stored;
}
async function readStoredFile(
  version: string,
  file: Publication["files"][number],
) {
  const path = await regularPath(version, `files/${file.path}`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if ((await handle.stat()).size !== file.size) throw invalid();
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};
const assetHeaders = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' http: https:; style-src 'unsafe-inline' http: https:; img-src data: blob: http: https:; font-src data: http: https:; media-src blob: http: https:; connect-src http: https:; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors *",
};
export async function hostedAsset(
  request: Request,
  version: string,
  path: string,
) {
  try {
    if (!safePath(path)) throw invalid();
    const publication = await readPublication(version);
    const file = publication.files.find((f) => f.path === path);
    if (!file) throw invalid();
    const bytes = await readStoredFile(version, file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== publication.hashes[path]) throw invalid();
    const type = mime[extname(path).toLowerCase()];
    const headers = {
      ...assetHeaders,
      "Content-Type": type ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${hash}"`,
      ...(!type ? { "Content-Disposition": "attachment" } : {}),
    };
    if (request.headers.get("if-none-match") === headers.ETag)
      return new Response(null, { status: 304, headers });
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: { ...headers, "Content-Length": String(file.size) },
    });
  } catch {
    return new Response(
      request.method === "HEAD" ? null : "Static artifact not found.",
      {
        status: 404,
        headers: {
          ...assetHeaders,
          "Cache-Control": "no-store",
          "Content-Type": "text/plain",
        },
      },
    );
  }
}
