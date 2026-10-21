import "server-only";
import { AppError } from "./errors.ts";
import { repositoryKey } from "./providers/types.ts";
import type { Repositories, ReadContext } from "./repositories.ts";
import type { ShareTarget } from "../lib/share-link.ts";
import { validBranchName } from "../lib/collaboration.ts";

const unavailable = () =>
  new AppError("SHARE_UNAVAILABLE", "内容不存在或暂不可读。", 404);
const invalid = () =>
  new AppError(
    "INVALID_PARAMETER",
    "请提供有效的仓库、Change 和协作分支。",
    400,
  );
const lostSource = new Set([
  "SESSION_REQUIRED",
  "TOKEN_INVALID",
  "IDENTITY_CHANGED",
  "READ_DENIED",
  "REPOSITORY_MISMATCH",
  "PROVIDER_MISMATCH",
]);

export async function readSharedTarget<T>(
  repos: Repositories,
  target: ShareTarget,
  signal: AbortSignal,
  operation: (context: ReadContext) => Promise<T>,
): Promise<T> {
  if (
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(target.change) ||
    target.change.length > 200 ||
    (target.collaborationBranch !== undefined &&
      !validBranchName(target.collaborationBranch))
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(target.repository);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw invalid();
  // Production's registry only contains GitHub.com. Fixture providers use the
  // same parsing contract; the input never supplies a new network destination.
  const parsed = repos.sessions.registry.describe().flatMap((descriptor) => {
    try {
      const selector = repos.sessions.registry
        .get(descriptor.id)
        .parseRepositoryUrl(url.href);
      return [{ descriptor, fullName: selector.fullName.toLowerCase() }];
    } catch {
      return [];
    }
  });
  if (!parsed.length) throw invalid();
  const bindings = (await repos.sessions.repositoryBindings()).sort((a, b) =>
    a.workspaceId.localeCompare(b.workspaceId),
  );
  const candidates = [];
  for (const binding of bindings) {
    signal.throwIfAborted();
    const source = parsed.find(
      ({ descriptor }) =>
        descriptor.id === binding.providerId &&
        descriptor.instance === binding.instanceId,
    );
    if (!source) continue;
    const known = await repos.discoveries
      .knownRepositories(binding.workspaceId)
      .catch((error) => {
        // Discovery is a rebuildable per-binding cache. One damaged cache must
        // not disable otherwise valid sources belonging to another account.
        if (
          error instanceof AppError &&
          error.code === "DISCOVERY_DATA_INVALID"
        )
          return [];
        throw error;
      });
    for (const found of known) {
      const r = found.repository;
      if (
        r.providerId === binding.providerId &&
        r.instanceId === binding.instanceId &&
        r.fullName.toLowerCase() === source.fullName &&
        repositoryKey(r) === found.key &&
        (!target.collaborationBranch ||
          found.collaborationBranch === target.collaborationBranch)
      )
        candidates.push({ binding, found, fullName: source.fullName });
    }
  }
  if (new Set(candidates.map((c) => c.found.collaborationBranch)).size > 1)
    throw new AppError(
      "SHARE_BRANCH_REQUIRED",
      "此仓库有多个协作来源，请在链接中指定 collaborationBranch。",
      400,
    );
  for (const { binding, found, fullName } of candidates) {
    signal.throwIfAborted();
    try {
      return await repos.readShared(
        binding.accountId,
        binding.workspaceId,
        found.key,
        found.repository,
        found.collaborationBranch,
        async (ctx) => {
          if (ctx.repository.fullName.toLowerCase() !== fullName)
            throw new AppError("REPOSITORY_MISMATCH", "仓库地址已变化。", 403);
          return operation(ctx);
        },
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      // An aborted Git/read operation can hide the binding removal that caused
      // it. Check ownership again before deciding whether to try another source.
      try {
        const lease = await repos.sessions.credentialLease(
          binding.accountId,
          binding.workspaceId,
          signal,
        );
        lease.release();
      } catch (current) {
        error = current;
      }
      if (!(error instanceof AppError) || !lostSource.has(error.code))
        throw error;
    }
  }
  throw unavailable();
}
