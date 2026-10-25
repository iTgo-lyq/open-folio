import "server-only";
import type {
  ChangeGroup,
  Delivery,
  IntegrationIndex,
  PullRequest,
  ReleaseSource,
} from "../lib/model.ts";
import { AppError } from "./errors.ts";
import { integrationFor } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { PullRequestCache, type DeliveryReader } from "./pull-requests.ts";
export type { DeliveryReader } from "./pull-requests.ts";

type Input = {
  changes: ChangeGroup[];
  integrations: IntegrationIndex;
  integrationBranch: string | null;
  releaseSource: ReleaseSource;
  previous?: Record<string, Delivery>;
  reader?: DeliveryReader;
  cache?: PullRequestCache;
  ancestor: (before: string, after: string) => Promise<boolean>;
  signal: AbortSignal;
};
const message = (error: unknown) => {
  if (
    error instanceof AppError &&
    [
      "RATE_LIMITED",
      "TOKEN_INVALID",
      "READ_DENIED",
      "OPERATION_CANCELLED",
      "PR_CACHE_INVALID",
      "PR_CACHE_LIMIT",
    ].includes(error.code)
  )
    throw error;
  return error instanceof AppError
    ? error.message
    : "PR 信息暂不可读取，请稍后重试。";
};

/** Project only known Changes; platform data never discovers or mutates a Change. */
export async function collectDelivery(input: Input) {
  const { reader, signal, releaseSource } = input;
  const cache = input.cache ?? new PullRequestCache();
  if (reader)
    cache.retain(
      reader,
      [input.integrationBranch, releaseSource.branch].filter(
        (base): base is string => !!base,
      ),
    );
  const changeIndex = new Map<string, PullRequest[]>();
  const releaseIndex = new Map<string, PullRequest[]>();
  const add = (
    index: Map<string, PullRequest[]>,
    key: string,
    pr: PullRequest,
  ) => {
    const items = index.get(key) ?? [];
    items.push(pr);
    index.set(key, items);
  };
  let changeError: string | undefined;
  let releaseError: string | undefined;
  for (const [kind, base] of [
    ["change", input.integrationBranch],
    ["release", releaseSource.branch],
  ] as const) {
    let errorMessage: string | undefined;
    if (reader && base) {
      try {
        for (const { marker, ...pr } of await cache.query(
          reader,
          base,
          signal,
        )) {
          if (kind === "change" && marker.kind === "change")
            add(changeIndex, JSON.stringify([marker.id, pr.head.branch]), pr);
          if (kind === "release" && marker.kind === "release")
            for (const id of marker.includes)
              add(releaseIndex, id, { ...pr, version: marker.version });
        }
      } catch (error) {
        signal.throwIfAborted();
        errorMessage = message(error);
      }
    } else errorMessage = "PR 信息未接通，交付结果待核实。";
    if (kind === "change") changeError = errorMessage;
    else releaseError = errorMessage;
  }

  const deliveryByChange: Record<string, Delivery> = {};
  let complete = !changeError && !releaseError;
  const remaining = [...input.changes];
  const worker = async () => {
    for (let group = remaining.shift(); group; group = remaining.shift()) {
      signal.throwIfAborted();
      const prior = input.previous?.[group.id];
      const candidate = group.candidates.find((c) => c.key === group.primary);
      const integration = integrationFor(input.integrations, group.id);
      const branch = candidate?.state?.branch;
      const diagnostics: string[] = [];
      let changePrsStale = false;
      const releasePrsStale = !!releaseError;
      let changePrs: PullRequest[] = [];
      if (changeError) {
        diagnostics.push(changeError);
        changePrsStale = true;
        changePrs = prior?.changePrs ?? [];
      } else if (branch) {
        changePrs = [
          ...(changeIndex.get(JSON.stringify([group.id, branch])) ?? []),
        ];
      } else {
        diagnostics.push("Change 来源或 PR 读取能力尚未就绪。");
        changePrsStale = true;
      }
      let releasePrs: PullRequest[];
      if (releaseError) {
        diagnostics.push(releaseError);
        releasePrs = prior?.releasePrs ?? [];
      } else releasePrs = [...(releaseIndex.get(group.id) ?? [])];
      const changeConflict =
        changePrs.filter((p) => p.state === "open").length > 1;
      const releaseConflict =
        releasePrs.filter((p) => p.state === "open").length > 1;
      if (changeConflict || releaseConflict)
        diagnostics.push(
          "存在多个待合入 PR，无法确定当前交付，请核对关联标记。",
        );
      let stage: Delivery["stage"];
      // candidate.branch is the read source; state.branch retains historical ownership.
      if (
        candidate?.validCompleted &&
        candidate.archived &&
        candidate.branch === input.integrationBranch &&
        candidate.state?.deliveryOverride === "releaseMerged"
      ) {
        stage = "releaseMerged";
      } else if (integration.status === "found") {
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
        } else if (
          !changePrsStale &&
          !changePrs.some((p) => p.state === "open")
        )
          diagnostics.push("尚无待合入的关联 Change PR。");
      }
      if (stage === "pendingIntegration" && (changePrsStale || changeConflict))
        stage = "unknown";
      if (stage === "pendingRelease" && releaseConflict) stage = "unknown";
      const stale = changePrsStale || releasePrsStale;
      if (stale) complete = false;
      deliveryByChange[group.id] = {
        ...(stage ? { stage } : {}),
        changePrs: changePrs.sort((a, b) => b.number - a.number),
        releasePrs: releasePrs.sort((a, b) => b.number - a.number),
        diagnostics: [...new Set(diagnostics)],
        stale,
        changePrsStale,
        releasePrsStale,
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
