import "server-only";
import type {
  ChangeGroup,
  Delivery,
  IntegrationIndex,
  PullRequest,
  ReleaseSource,
} from "../lib/model.ts";
import type {
  Page,
  ProviderPullRequest,
  PullRequestQuery,
} from "./providers/types.ts";
import { AppError } from "./errors.ts";
import { integrationFor } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { prMarker } from "../../.agents/skills/spec-trail/scripts/pr-markers.mjs";

export type DeliveryReader = {
  repositoryId: string;
  list: (
    query: PullRequestQuery,
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<Page<ProviderPullRequest>>;
  get: (number: number, signal: AbortSignal) => Promise<ProviderPullRequest>;
};
type Input = {
  changes: ChangeGroup[];
  integrations: IntegrationIndex;
  integrationBranch: string | null;
  releaseSource: ReleaseSource;
  previous?: Record<string, Delivery>;
  reader?: DeliveryReader;
  ancestor: (before: string, after: string) => Promise<boolean>;
  signal: AbortSignal;
};
const summary = ({ body, ...p }: ProviderPullRequest): PullRequest => {
  const marker = prMarker(body);
  return {
    ...p,
    ...(marker.kind === "release" ? { version: marker.version } : {}),
  };
};
const message = (error: unknown) => {
  if (
    error instanceof AppError &&
    ["TOKEN_INVALID", "READ_DENIED", "OPERATION_CANCELLED"].includes(error.code)
  )
    throw error;
  return error instanceof AppError
    ? error.message
    : "PR 信息暂不可读取，请稍后重试。";
};

/** Project only known Changes; platform data never discovers or mutates a Change. */
export async function collectDelivery(input: Input) {
  const { reader, signal, releaseSource } = input;
  const details = new Map<number, Promise<ProviderPullRequest>>();
  const get = (number: number) => {
    if (!details.has(number)) details.set(number, reader!.get(number, signal));
    return details.get(number)!;
  };
  const list = async (query: PullRequestQuery) => {
    const items: ProviderPullRequest[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      signal.throwIfAborted();
      const result = await reader!.list(query, cursor, signal);
      items.push(...result.items);
      if (!result.nextCursor) return items;
      if (result.nextCursor === cursor) break;
      cursor = result.nextCursor;
    }
    throw new AppError("PR_INCOMPLETE", "PR 查询未完成分页，交付结果待核实。");
  };
  const sameRepo = (p: ProviderPullRequest) =>
    p.base.repositoryId === reader?.repositoryId &&
    // GitHub may omit a deleted source repository; same-repository branches retain its id.
    p.head.repositoryId === reader?.repositoryId;
  const releases: ProviderPullRequest[] = [];
  let releaseError: string | undefined;
  if (reader && releaseSource.branch) {
    try {
      releases.push(
        ...(await list({ base: releaseSource.branch })).filter(
          (p) =>
            sameRepo(p) &&
            p.base.branch === releaseSource.branch &&
            prMarker(p.body).kind === "release",
        ),
      );
    } catch (error) {
      signal.throwIfAborted();
      releaseError = message(error);
    }
  } else releaseError = "PR 信息未接通，交付结果待核实。";

  const deliveryByChange: Record<string, Delivery> = {};
  let complete = !releaseError;
  const remaining = [...input.changes];
  const worker = async () => {
    for (let group = remaining.shift(); group; group = remaining.shift()) {
      signal.throwIfAborted();
      const prior = input.previous?.[group.id];
      const candidate = group.candidates.find((c) => c.key === group.primary);
      const integration = integrationFor(input.integrations, group.id);
      const branch = candidate?.state?.branch;
      const diagnostics: string[] = [];
      let stale = false;
      const prs = new Map<number, ProviderPullRequest>();
      const match = (p: ProviderPullRequest) => {
        const marker = prMarker(p.body);
        return (
          sameRepo(p) &&
          p.base.branch === input.integrationBranch &&
          p.head.branch === branch &&
          marker.kind === "change" &&
          marker.id === group.id
        );
      };
      let changePrs: PullRequest[] = [];
      if (reader && branch && input.integrationBranch) {
        try {
          for (const old of prior?.changePrs ?? []) {
            const current = await get(old.number);
            if (match(current)) prs.set(current.number, current);
          }
          const current = [...prs.values()];
          if (
            !current.some((p) => p.state === "open") &&
            !(
              integration.status === "found" &&
              current.some(
                (p) =>
                  p.state === "merged" && p.mergeCommit === integration.commit,
              )
            )
          ) {
            for (const p of await list({
              head: branch,
              base: input.integrationBranch,
            }))
              if (match(p)) prs.set(p.number, p);
            if (
              integration.status === "found" &&
              ![...prs.values()].some(
                (p) =>
                  p.state === "merged" && p.mergeCommit === integration.commit,
              )
            )
              for (const p of await list({ commit: integration.commit }))
                if (match(p)) prs.set(p.number, p);
          }
          changePrs = [...prs.values()].map(summary);
        } catch (error) {
          signal.throwIfAborted();
          diagnostics.push(message(error));
          stale = true;
          changePrs = prior?.changePrs ?? [];
        }
      } else {
        diagnostics.push("Change 来源或 PR 读取能力尚未就绪。");
        stale = true;
      }
      let releasePrs: PullRequest[];
      if (releaseError) {
        diagnostics.push(releaseError);
        releasePrs = prior?.releasePrs ?? [];
        stale = true;
      } else
        releasePrs = releases
          .filter((p) => {
            const marker = prMarker(p.body);
            return (
              marker.kind === "release" && marker.includes.includes(group.id)
            );
          })
          .map(summary);
      const conflict =
        changePrs.filter((p) => p.state === "open").length > 1 ||
        releasePrs.filter((p) => p.state === "open").length > 1;
      if (conflict)
        diagnostics.push(
          "存在多个待合入 PR，无法确定当前交付，请核对关联标记。",
        );
      let stage: Delivery["stage"];
      if (integration.status === "found") {
        stage = "pendingRelease";
        if (
          changePrs.some(
            (p) => p.state === "merged" && p.mergeCommit !== integration.commit,
          )
        )
          diagnostics.push(
            "Change PR 合并提交与有效集成记录不一致，请核对历史。",
          );
        if (releaseSource.message) diagnostics.push(releaseSource.message);
        if (!releaseSource.commit || releaseError) stage = "unknown";
        else {
          for (const p of releasePrs.filter((p) => p.state === "merged")) {
            if (
              p.mergeCommit &&
              (await input.ancestor(p.mergeCommit, releaseSource.commit)) &&
              (await input.ancestor(integration.commit, p.mergeCommit))
            )
              stage = "releaseMerged";
            else {
              diagnostics.push(
                `发布 PR #${p.number} 已合入，Git 结果仍待核实。`,
              );
              if (stage !== "releaseMerged") stage = "unknown";
            }
          }
        }
      } else if (integration.status !== "missing") {
        stage = "unknown";
        diagnostics.push(integration.message);
      } else if (candidate?.validCompleted) {
        stage = "pendingIntegration";
        if (changePrs.some((p) => p.state === "merged")) {
          stage = "unknown";
          diagnostics.push("PR 已合入，但尚未找到有效集成记录。");
        } else if (!changePrs.some((p) => p.state === "open"))
          diagnostics.push("尚无待合入的关联 Change PR。");
      }
      if ((stale || conflict) && stage) stage = "unknown";
      if (stale) complete = false;
      deliveryByChange[group.id] = {
        ...(stage ? { stage } : {}),
        changePrs: changePrs.sort((a, b) => b.number - a.number),
        releasePrs: releasePrs.sort((a, b) => b.number - a.number),
        diagnostics: [...new Set(diagnostics)],
        stale,
      };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, remaining.length) }, worker),
  );
  // Stable ordering avoids new snapshots caused only by request completion order.
  return {
    deliveryByChange: Object.fromEntries(
      Object.entries(deliveryByChange).sort(([a], [b]) => a.localeCompare(b)),
    ),
    complete,
  };
}
