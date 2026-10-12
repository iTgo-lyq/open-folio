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
import type { Branch, DocumentRef, Limits } from "../lib/model.ts";
import { inspectMarkdown } from "../lib/markdown.ts";
import { AppError } from "./errors.ts";
const exec = promisify(execFile);
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
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
}
export class GitReader {
  directory: string;
  url: string;
  protocol: "https" | "file";
  private transport?: GitTransport;
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
    return `[core]\nrepositoryformatversion = 0\nfilemode = true\nbare = true\n[remote "origin"]\nurl = "${url}"\nfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  }
  async run(
    args: string[],
    signal?: AbortSignal,
    inputLimit = 16 * 1024 * 1024,
  ): Promise<Buffer> {
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
  async collect(limits: Limits, signal: AbortSignal) {
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
    const head = (
      await this.run(["ls-remote", "--symref", "origin", "HEAD"], signal)
    ).toString();
    const defaultBranch =
      /^ref: refs\/heads\/(.+)\tHEAD$/m.exec(head)?.[1] ?? null;
    await this.run(
      [
        "fetch",
        "--atomic",
        "--prune",
        "--no-tags",
        "--no-recurse-submodules",
        "origin",
        "+refs/heads/*:refs/remotes/origin/*",
        "+refs/tags/spec-trail/archive-v2/*:refs/openfolio/archive-v2/*",
      ],
      signal,
    );
    const refs = (
      await this.run(
        [
          "for-each-ref",
          "--format=%(objectname) %(refname)",
          "refs/remotes/origin/",
        ],
        signal,
      )
    )
      .toString()
      .trim();
    const branches: Branch[] = refs
      ? refs.split("\n").map((row) => {
          const [commit, ref] = row.split(" ");
          return { name: ref.slice("refs/remotes/origin/".length), commit };
        })
      : [];
    if (branches.length > limits.branches)
      throw new AppError(
        "SOURCE_LIMIT",
        "远端分支数量超过配置限制，已保留上次快照。",
      );
    const archiveRows = (
      await this.run(
        ["for-each-ref", "--format=%(refname)", "refs/openfolio/archive-v2/"],
        signal,
      )
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    const archiveRefs: { id: string; commit: string }[] = [];
    for (const ref of archiveRows) {
      const id = ref.slice("refs/openfolio/archive-v2/".length);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) continue;
      try {
        archiveRefs.push({
          id,
          commit: (
            await this.run(["rev-parse", "--verify", `${ref}^{commit}`], signal)
          )
            .toString()
            .trim(),
        });
      } catch {
        /* A tag to a non-commit is not a preview revision. */
      }
    }
    const documents: DocumentRef[] = [],
      blobs = new Map<string, Buffer>();
    let total = 0;
    const sources = [
      ...branches.map((b) => ({ ...b, archiveId: "" })),
      ...archiveRefs.map((r) => ({
        name: `refs/tags/spec-trail/archive-v2/${r.id}`,
        commit: r.commit,
        archiveId: r.id,
      })),
    ];
    for (const branch of sources) {
      const raw = (
        await this.run(
          [
            "ls-tree",
            "-rz",
            "--full-tree",
            branch.commit,
            "--",
            "docs/project/",
          ],
          signal,
        )
      ).toString("utf8");
      for (const row of raw.split("\0")) {
        if (!row) continue;
        const tab = row.indexOf("\t"),
          [mode, kind, blob] = row.slice(0, tab).split(" "),
          path = row.slice(tab + 1);
        if (!safePath(path)) continue;
        if (
          branch.archiveId &&
          !new RegExp(
            `^docs/project/archive/[0-9]{4}-[0-9]{2}-[0-9]{2}-${branch.archiveId}/`,
          ).test(path)
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
              : /\.(png|jpe?g|gif|webp|avif)$/i.test(path)
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
              message: "图片签名不属于支持的格式。",
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
    }
    return { defaultBranch, branches, archiveRefs, documents, blobs };
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
