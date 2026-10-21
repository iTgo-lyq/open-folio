import "server-only";
import type { PullRequest } from "../../lib/model.ts";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { AppError } from "../errors.ts";

export class SecretHandle {
  #value: string;
  constructor(value: string) {
    const token = value.trim();
    if (!token || token.length > 4096 || /[\x00-\x20\x7f]/.test(token))
      throw new AppError("INVALID_TOKEN", "请输入有效的个人访问令牌。", 400);
    this.#value = token;
  }
  use<T>(operation: (value: string) => T): T {
    return operation(this.#value);
  }
  toJSON(): never {
    throw new Error("Secrets cannot be serialized");
  }
  [inspect.custom]() {
    return "SecretHandle [redacted]";
  }
}
export interface ProviderIdentity {
  providerId: string;
  instanceId: string;
  subjectId: string;
  login: string;
  displayName: string;
}
export interface RepositoryIdentity {
  providerId: string;
  instanceId: string;
  repositoryId: string;
  fullName: string;
  displayName: string;
  webUrl: string;
  cloneUrl: string;
  defaultBranch: string | null;
}
export interface ProviderContext {
  identity: ProviderIdentity;
  gitUsername?: string;
  secret: SecretHandle;
  signal: AbortSignal;
}
export interface GitTransport {
  url: string;
  username: string;
  secret: SecretHandle;
}
export interface ConnectionDescriptor {
  id: string;
  name: string;
  instance: string;
  tokenUrl: string;
  permissions: string[];
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export type RepositorySelector = { fullName: string; repositoryId?: string };
export type ProbeResult =
  | { kind: "file"; commit: string; bytes: Uint8Array }
  | { kind: "missing"; commit: string }
  | { kind: "branch-missing" }
  | { kind: "empty-repository" }
  | { kind: "unavailable"; reason: string; retryAfter?: string };
export type ProviderPullRequest = PullRequest & { body: string };
export type PullRequestQuery = {
  base?: string;
  head?: string;
  commit?: string;
};
export interface RepositoryProvider {
  listPullRequests?(
    context: ProviderContext,
    repo: RepositoryIdentity,
    query: PullRequestQuery,
    cursor: string | null,
  ): Promise<Page<ProviderPullRequest>>;
  getPullRequest?(
    context: ProviderContext,
    repo: RepositoryIdentity,
    number: number,
  ): Promise<ProviderPullRequest>;
  id: string;
  describeConnection(): ConnectionDescriptor;
  parseRepositoryUrl(input: string): RepositorySelector;
  authenticate(
    secret: SecretHandle,
    signal: AbortSignal,
  ): Promise<ProviderIdentity & { gitUsername?: string }>;
  listRepositories(
    context: ProviderContext,
    cursor: string | null,
  ): Promise<Page<RepositoryIdentity>>;
  resolveRepository(
    context: ProviderContext,
    selector: RepositorySelector,
  ): Promise<RepositoryIdentity>;
  assertRead(
    context: ProviderContext,
    repo: RepositoryIdentity,
    integrationBranch?: string,
  ): Promise<void>;
  probeWorkflow(
    context: ProviderContext,
    repo: RepositoryIdentity,
    integrationBranch: string,
  ): Promise<ProbeResult>;
  gitTransport(
    context: ProviderContext,
    repo: RepositoryIdentity,
  ): Promise<GitTransport>;
}
export class ProviderError extends AppError {
  retryAfter?: string;
  constructor(
    code: string,
    message: string,
    status = 503,
    retryAfter?: string,
  ) {
    super(code, message, status);
    this.retryAfter = retryAfter;
  }
}
export const repositoryKey = (
  r: Pick<RepositoryIdentity, "providerId" | "instanceId" | "repositoryId">,
) =>
  createHash("sha256")
    .update(JSON.stringify([r.providerId, r.instanceId, r.repositoryId]))
    .digest("hex");
export function assertProviderContext(
  context: ProviderContext,
  id: string,
  instance: string,
) {
  context.signal.throwIfAborted();
  if (
    context.identity.providerId !== id ||
    context.identity.instanceId !== instance
  )
    throw new ProviderError(
      "PROVIDER_MISMATCH",
      "连接与代码托管服务不匹配。",
      400,
    );
}
