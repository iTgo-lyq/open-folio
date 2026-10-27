import "server-only";
import type {
  ChangeGroup,
  Delivery,
  IntegrationIndex,
  PullRequest,
  ReleaseSource,
} from "../lib/model.ts";
import { AppError } from "./errors.ts";
import {
  INTEGRATION_VERSION,
  deliveryPullRequests,
  integrationEvidence,
  type IntegrationResult,
} from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import {
  PullRequestCache,
  type DeliveryReader,
  type CatalogItem,
} from "./pull-requests.ts";
import { parentBranch } from "../../.agents/skills/spec-trail/scripts/routing.mjs";
export type { DeliveryReader } from "./pull-requests.ts";

type Input = {
  changes: ChangeGroup[];
  integrationTip: string | null;
  branchTips?: Record<string, string>;
  readIntegration: (commit: string, id: string) => Promise<IntegrationResult>;
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
  const primary = (group: ChangeGroup) =>
    group.candidates.find((c) => c.key === group.primary);
  const byId = new Map(
    input.changes.map((group) => [group.id, primary(group)]),
  );
  const targets = new Map<string, { branch?: string; error?: string }>();
  for (const group of input.changes) {
    const state = primary(group)?.state;
    if (!state?.parent) continue;
    const parent = byId.get(state.parent)?.state;
    try {
      // Old children already delivered directly retain their historical PR base.
      const branch =
        parent?.branch === input.integrationBranch &&
        parent?.children?.includes(state.id)
          ? input.integrationBranch!
          : parentBranch(
              state,
              parent,
              input.integrationBranch,
              releaseSource.branch,
            );
      targets.set(group.id, { branch });
    } catch {
      targets.set(group.id, { error: "父 Change 关系或开发分支尚不可核实。" });
    }
  }
  const changeBases = [
    ...new Set(
      [
        input.integrationBranch,
        ...[...targets.values()].map((t) => t.branch),
      ].filter((base): base is string => !!base),
    ),
  ];
  if (reader)
    cache.retain(reader, [
      ...changeBases,
      ...(releaseSource.branch ? [releaseSource.branch] : []),
    ]);
  const changeIndex = new Map<string, CatalogItem[]>();
  const releaseIndex = new Map<string, PullRequest[]>();
  const add = <T>(index: Map<string, T[]>, key: string, pr: T) => {
    const items = index.get(key) ?? [];
    items.push(pr);
    index.set(key, items);
  };
  const baseErrors = new Map<string, string>();
  let changeError: string | undefined;
  let releaseError: string | undefined;
  for (const [kind, base] of [
    ...changeBases.map((base) => ["change", base] as const),
    ["release", releaseSource.branch],
  ] as const) {
    let errorMessage: string | undefined;
    if (reader && base) {
      try {
        for (const item of await cache.query(reader, base, signal)) {
          const { marker, ...pr } = item;
          if (kind === "change" && marker.kind === "change")
            add(changeIndex, marker.id, item);
          if (kind === "release" && marker.kind === "release")
            for (const id of marker.includes)
              add(releaseIndex, id, { ...pr, version: marker.version });
        }
      } catch (error) {
        signal.throwIfAborted();
        errorMessage = message(error);
      }
    } else errorMessage = "PR 信息未接通，交付结果待核实。";
    if (kind === "change") {
      if (errorMessage && base) baseErrors.set(base, errorMessage);
      if (base === input.integrationBranch) changeError = errorMessage;
    } else releaseError = errorMessage;
  }

  if (!input.integrationBranch) changeError = "集成分支尚未配置。";
  const integrations: IntegrationIndex = {
    version: INTEGRATION_VERSION,
    tip: input.integrationTip,
    complete: !changeError && !!input.integrationTip,
    records: {},
    issues: [],
    ...(changeError || !input.integrationTip
      ? { message: changeError ?? "集成版本尚不可读取。" }
      : {}),
  };
  const deliveryByChange: Record<string, Delivery> = {};
  let complete = !changeError && !releaseError;
  const remaining = [...input.changes];
  const worker = async () => {
    for (let group = remaining.shift(); group; group = remaining.shift()) {
      signal.throwIfAborted();
      const prior = input.previous?.[group.id];
      const candidate = group.candidates.find((c) => c.key === group.primary);
      const branch = candidate?.state?.branch;
      const target = targets.get(group.id);
      const localError =
        changeError ??
        target?.error ??
        (target?.branch ? baseErrors.get(target.branch) : undefined);
      const diagnostics: string[] = [];
      let changePrsStale = false;
      const releasePrsStale = !!releaseError;
      let changePrs: PullRequest[] = [];
      if (localError) {
        diagnostics.push(localError);
        changePrsStale = true;
        changePrs = prior?.changePrs ?? [];
      } else if (branch) {
        changePrs = deliveryPullRequests(changeIndex.get(group.id) ?? [], {
          repositoryId: reader!.repositoryId,
          integrationBranch: input.integrationBranch!,
          id: group.id,
          branch,
          parentBranch: target?.branch,
        }).map(({ marker: _marker, ...pr }) => pr);
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
      const merged = changePrs.filter((p) => p.state === "merged");
      const targetBranch =
        merged.length === 1
          ? merged[0].base.branch
          : (target?.branch ?? input.integrationBranch);
      const targetTip =
        targetBranch === input.integrationBranch
          ? input.integrationTip
          : (input.branchTips?.[targetBranch!] ??
            (candidate?.archived && candidate.branch === input.integrationBranch
              ? input.integrationTip
              : null));
      const evidence = changePrsStale
        ? {
            status: "unavailable" as const,
            message: localError ?? "Change 来源或 PR 读取能力尚未就绪。",
          }
        : await integrationEvidence(input.ancestor, targetTip, changePrs);
      let integration =
        evidence.status === "found"
          ? await input.readIntegration(evidence.commit, group.id)
          : evidence;
      if (integration.status === "found" && targetBranch)
        integration = { ...integration, targetBranch };
      Object.defineProperty(integrations.records, group.id, {
        value: integration,
        enumerable: true,
      });
      if (evidence.status === "unavailable") complete = false;
      const integratedCommit =
        evidence.status === "found" ? evidence.commit : null;
      if (integratedCommit && integration.status !== "found")
        diagnostics.push(
          "PR 合入已核实，合入差异暂不可用。" + integration.message,
        );
      let inProject = targetBranch === input.integrationBranch;
      let projectError: string | undefined;
      if (integratedCommit && !inProject) {
        try {
          if (!input.integrationTip) throw Error("No project tip");
          inProject = await input.ancestor(
            integratedCommit,
            input.integrationTip,
          );
        } catch {
          projectError = "子项已合入父分支，项目集成历史暂不可核实。";
          complete = false;
        }
      }
      let stage: Delivery["stage"];
      // candidate.branch is the read source; state.branch retains historical ownership.
      if (
        candidate?.validCompleted &&
        candidate.archived &&
        candidate.branch === input.integrationBranch &&
        candidate.state?.deliveryOverride === "releaseMerged"
      ) {
        stage = "releaseMerged";
      } else if (integratedCommit && !inProject) {
        stage = projectError ? "unknown" : "pendingIntegration";
        diagnostics.push(
          projectError ?? `已合入父分支 ${targetBranch}，等待父项整体集成。`,
        );
      } else if (integratedCommit) {
        stage = "pendingRelease";
        if (releaseSource.message) diagnostics.push(releaseSource.message);
        if (!releaseSource.commit || releaseError) stage = "unknown";
        else {
          for (const p of releasePrs.filter((p) => p.state === "merged")) {
            if (
              p.mergeCommit &&
              (await input.ancestor(p.mergeCommit, releaseSource.commit)) &&
              (await input.ancestor(integratedCommit, p.mergeCommit))
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
      } else if (evidence.status !== "missing") {
        stage = "unknown";
        if (evidence.status !== "found") diagnostics.push(evidence.message);
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
  integrations.records = Object.fromEntries(
    Object.entries(integrations.records).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    integrations,
    deliveryByChange: Object.fromEntries(
      Object.entries(deliveryByChange).sort(([a], [b]) => a.localeCompare(b)),
    ),
    complete,
  };
}
