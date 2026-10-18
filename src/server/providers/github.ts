import {
  SUGGESTED_COLLABORATION_BRANCH,
  validBranchName,
} from "../../lib/collaboration.ts";
import "server-only";
import { z } from "zod";
import {
  SecretHandle,
  ProviderError,
  assertProviderContext,
  type ProviderContext,
  type RepositoryIdentity,
  type RepositorySelector,
  type RepositoryProvider,
  type ProbeResult,
  type ProviderIdentity,
} from "./types.ts";

const api = "https://api.github.com";
export const githubApiVersion = "2026-03-10";
const affiliation = "owner,collaborator,organization_member";
const firstPage = `${api}/user/repos?affiliation=${affiliation}&per_page=100&page=1`;
const name = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
  .refine((v) => ![".", ".."].includes(v));
const fullName = z
  .string()
  .max(202)
  .refine(
    (v) =>
      v.split("/").length === 2 &&
      v.split("/").every((p) => name.safeParse(p).success),
  );
const id = z.number().int().positive().safe().transform(String);
const sha = z.string().regex(/^[a-f0-9]{40,64}$/);
const repoSchema = z.object({
  id,
  full_name: fullName,
  name,
  default_branch: z.string().min(1).max(255).nullable().optional(),
});
const commitSchema = z.object({
  sha,
  commit: z.object({ tree: z.object({ sha }) }),
});
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({ path: z.string(), mode: z.string(), type: z.string(), sha }),
  ),
});
const dataError = () =>
  new ProviderError(
    "PROVIDER_DATA_INVALID",
    "GitHub 返回的数据不完整，请重试。",
  );
function parsed<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw dataError();
  return result.data;
}
function normalize(value: unknown): RepositoryIdentity {
  const r = parsed(repoSchema, value);
  return {
    providerId: "github",
    instanceId: "github.com",
    repositoryId: r.id,
    fullName: r.full_name,
    displayName: r.name,
    webUrl: `https://github.com/${r.full_name}`,
    cloneUrl: `https://github.com/${r.full_name}.git`,
    defaultBranch: r.default_branch ?? null,
  };
}
export function githubRepositoryName(input: string): string {
  try {
    const u = new URL(input);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "github.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error();
    return parsed(
      fullName,
      u.pathname
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .replace(/\.git$/, ""),
    );
  } catch {
    throw new ProviderError(
      "INVALID_REPOSITORY_URL",
      "请输入 GitHub.com 的 HTTPS 仓库地址。",
      400,
    );
  }
}
function pageNumber(input: string): number {
  try {
    const url = new URL(input);
    if (
      url.origin !== api ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== "/user/repos"
    )
      throw new Error();
    const entries = [...url.searchParams.entries()];
    if (
      entries.length !== 3 ||
      new Set(entries.map(([k]) => k)).size !== 3 ||
      url.searchParams.get("affiliation") !== affiliation ||
      url.searchParams.get("per_page") !== "100"
    )
      throw new Error();
    const value = url.searchParams.get("page") || "";
    if (!/^[1-9]\d{0,6}$/.test(value)) throw new Error();
    return Number(value);
  } catch {
    throw new ProviderError(
      "INVALID_CONTINUATION",
      "GitHub 分页信息不合法，请重新发现仓库。",
      502,
    );
  }
}
export class GitHubProvider implements RepositoryProvider {
  readonly id = "github";
  #fetch: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) {
    this.#fetch = fetcher;
  }
  parseRepositoryUrl(input: string) {
    return { fullName: githubRepositoryName(input) };
  }
  describeConnection() {
    return {
      id: this.id,
      name: "GitHub",
      instance: "github.com",
      tokenUrl:
        "https://github.com/settings/personal-access-tokens/new?name=OpenFolio&contents=read",
      permissions: ["Metadata: Read", "Contents: Read"],
    };
  }
  async #request(
    path: string,
    secret: SecretHandle,
    signal: AbortSignal,
    purpose = "read",
  ) {
    const url = new URL(path, api);
    if (url.origin !== api || url.username || url.password || url.hash)
      throw dataError();
    let response: Response;
    try {
      response = await secret.use((token) =>
        this.#fetch(url, {
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": githubApiVersion,
            "User-Agent": "OpenFolio",
          },
        }),
      );
    } catch {
      throw new ProviderError(
        signal.aborted ? "OPERATION_CANCELLED" : "PROVIDER_UNAVAILABLE",
        signal.aborted ? "操作已取消。" : "暂时无法连接 GitHub，请重试。",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401)
        throw new ProviderError(
          "TOKEN_INVALID",
          "GitHub 连接已失效，请更新 token。",
          401,
        );
      const retry = response.headers.get("retry-after");
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (retry || response.headers.get("x-ratelimit-remaining") === "0"))
      )
        throw new ProviderError(
          "RATE_LIMITED",
          "GitHub 暂时限制了请求，请稍后重试。",
          429,
          retry && /^\d{1,7}$/.test(retry) ? retry : "60",
        );
      if ([403, 404].includes(response.status))
        throw new ProviderError(
          purpose === "list" ? "DISCOVERY_DENIED" : "READ_DENIED",
          purpose === "list"
            ? "无法发现仓库，请检查 token 范围和组织授权。"
            : "当前连接无法读取此仓库，请检查仓库与 Contents 读取权限。",
          403,
        );
      if (response.status === 409)
        throw new ProviderError("EMPTY_REPOSITORY", "仓库尚无提交。", 409);
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "GitHub 请求未完成，请重试。",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw dataError();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8 * 1024 * 1024) throw dataError();
        chunks.push(value);
      }
      return {
        value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        headers: response.headers,
      };
    } catch {
      throw dataError();
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  #context(ctx: ProviderContext, repo?: RepositoryIdentity) {
    assertProviderContext(ctx, this.id, "github.com");
    if (
      repo &&
      (repo.providerId !== this.id ||
        repo.instanceId !== "github.com" ||
        !fullName.safeParse(repo.fullName).success)
    )
      throw dataError();
  }
  async authenticate(
    secret: SecretHandle,
    signal: AbortSignal,
  ): Promise<ProviderIdentity> {
    const { value } = await this.#request("/user", secret, signal);
    const u = parsed(
      z.object({
        id,
        login: name,
        name: z.string().max(500).nullable().optional(),
      }),
      value,
    );
    return {
      providerId: this.id,
      instanceId: "github.com",
      subjectId: u.id,
      login: u.login,
      displayName: u.name || u.login,
    };
  }
  async listRepositories(ctx: ProviderContext, cursor: string | null) {
    this.#context(ctx);
    const page = cursor || firstPage;
    const number = pageNumber(page);
    const { value, headers } = await this.#request(
      page,
      ctx.secret,
      ctx.signal,
      "list",
    );
    if (!Array.isArray(value) || value.length > 100) throw dataError();
    const nextLinks = [
      ...(headers.get("link") || "").matchAll(/<([^>]+)>;\s*rel="next"/g),
    ];
    if (nextLinks.length > 1) throw dataError();
    const nextCursor = nextLinks[0]?.[1] ?? null;
    if (nextCursor && pageNumber(nextCursor) !== number + 1)
      throw new ProviderError(
        "INVALID_CONTINUATION",
        "GitHub 分页顺序异常，请重新发现仓库。",
        502,
      );
    return { items: value.map(normalize), nextCursor };
  }
  async resolveRepository(
    ctx: ProviderContext,
    selector: RepositorySelector,
  ): Promise<RepositoryIdentity> {
    this.#context(ctx);
    const path = parsed(fullName, selector.fullName);
    try {
      const r = normalize(
        (await this.#request(`/repos/${path}`, ctx.secret, ctx.signal)).value,
      );
      if (!selector.repositoryId || r.repositoryId === selector.repositoryId)
        return r;
    } catch (e) {
      if (
        !(e instanceof ProviderError) ||
        !["READ_DENIED", "PROVIDER_UNAVAILABLE"].includes(e.code) ||
        !selector.repositoryId
      )
        throw e;
    }
    if (selector.repositoryId) {
      let cursor: string | null = null;
      let pages = 0;
      do {
        if (++pages > 1000)
          throw new ProviderError(
            "DISCOVERY_LIMIT",
            "仓库定位超过本次检查上限，请从仓库目录重新选择。",
            503,
          );
        const page = await this.listRepositories(ctx, cursor);
        const found = page.items.find(
          (r) => r.repositoryId === selector.repositoryId,
        );
        if (found) return found;
        cursor = page.nextCursor;
      } while (cursor);
    }
    throw new ProviderError(
      "READ_DENIED",
      "当前连接无法找到或读取此仓库。",
      403,
    );
  }
  async #branch(
    ctx: ProviderContext,
    repo: RepositoryIdentity,
    branch: string,
  ) {
    this.#context(ctx, repo);
    if (!validBranchName(branch))
      throw new ProviderError("INVALID_PARAMETER", "协作分支名称不合法。", 400);
    try {
      // This Contents-authorized endpoint also returns [] for a missing branch.
      // Match the full ref: a prefix match must never select a different source.
      const refs = parsed(
        z.array(
          z.object({
            ref: z.string(),
            object: z.object({
              type: z.string(),
              sha: z.string().regex(/^[a-f0-9]{40}$/),
            }),
          }),
        ),
        (
          await this.#request(
            `/repos/${repo.fullName}/git/matching-refs/heads/${encodeURIComponent(branch)}`,
            ctx.secret,
            ctx.signal,
          )
        ).value,
      );
      const exact = refs.filter((ref) => ref.ref === `refs/heads/${branch}`);
      if (exact.length > 1 || exact.some((ref) => ref.object.type !== "commit"))
        throw dataError();
      return exact[0]?.object.sha ?? null;
    } catch (e) {
      if (e instanceof ProviderError && e.code === "EMPTY_REPOSITORY")
        return null;
      throw e;
    }
  }
  async assertRead(
    ctx: ProviderContext,
    repo: RepositoryIdentity,
    branch = SUGGESTED_COLLABORATION_BRANCH,
  ) {
    await this.#branch(ctx, repo, branch);
  }
  async probeWorkflow(
    ctx: ProviderContext,
    repo: RepositoryIdentity,
    collaborationBranch: string,
  ): Promise<ProbeResult> {
    this.#context(ctx, repo);
    const current = await this.resolveRepository(ctx, repo);
    const commit = await this.#branch(ctx, current, collaborationBranch);
    if (!commit) return { kind: "branch-missing" };
    const root = parsed(
      commitSchema,
      (
        await this.#request(
          `/repos/${current.fullName}/commits/${commit}`,
          ctx.secret,
          ctx.signal,
        )
      ).value,
    );
    if (root.sha !== commit) throw dataError();
    let tree = root.commit.tree.sha;
    for (const [index, part] of [
      "docs",
      "project",
      "workflow.json",
    ].entries()) {
      const result = parsed(
        treeSchema,
        (
          await this.#request(
            `/repos/${current.fullName}/git/trees/${tree}`,
            ctx.secret,
            ctx.signal,
          )
        ).value,
      );
      if (result.truncated) throw dataError();
      const matches = result.tree.filter((entry) => entry.path === part);
      if (!matches.length) return { kind: "missing", commit: root.sha };
      if (matches.length !== 1) throw dataError();
      const entry = matches[0];
      if (index < 2) {
        if (entry.type !== "tree" || entry.mode !== "040000")
          return { kind: "unavailable", reason: "WORKFLOW_INVALID" };
        tree = entry.sha;
      } else {
        if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
          return { kind: "unavailable", reason: "WORKFLOW_INVALID" };
        const blob = parsed(
          z.object({
            encoding: z.literal("base64"),
            size: z
              .number()
              .int()
              .nonnegative()
              .max(256 * 1024),
            content: z.string().max(360 * 1024),
          }),
          (
            await this.#request(
              `/repos/${current.fullName}/git/blobs/${entry.sha}`,
              ctx.secret,
              ctx.signal,
            )
          ).value,
        );
        if (!/^[A-Za-z0-9+/=\r\n]*$/.test(blob.content)) throw dataError();
        const bytes = Buffer.from(blob.content, "base64");
        if (bytes.length !== blob.size) throw dataError();
        return { kind: "file", commit: root.sha, bytes };
      }
    }
    throw dataError();
  }
  async gitTransport(ctx: ProviderContext, repo: RepositoryIdentity) {
    this.#context(ctx, repo);
    const url = `https://github.com/${parsed(fullName, repo.fullName)}.git`;
    if (repo.cloneUrl !== url) throw dataError();
    return {
      url,
      username: ctx.gitUsername ?? ctx.identity.login,
      secret: ctx.secret,
    };
  }
}
