import {
  primaryRecord,
  STAGES,
  STAGE_LABELS,
  type ChangeGroup,
  type Delivery,
} from "./model.ts";
import {
  readLabelQuery,
  matchesLabels,
  URGENCY_LABELS,
} from "./change-labels.ts";

export const DIRECTORY_STATES = [
  "active",
  "completed",
  "archived",
  "cancelled",
] as const;
export const DIRECTORY_LABELS = {
  active: "进行中",
  completed: "已完成",
  archived: "已归档",
  cancelled: "已取消",
};
export type DirectoryScope = (typeof DIRECTORY_STATES)[number];
export type DirectoryIdentity = { providerId: string; subjectId: string };
export function classifyDirectoryState(
  group: ChangeGroup,
  delivery?: Delivery,
): DirectoryScope | undefined {
  const record = primaryRecord(group);
  if (record?.validCompleted)
    return delivery?.stage === "releaseMerged" ||
      record.state?.deliveryOverride === "releaseMerged"
      ? "archived"
      : "completed";
  const status = record?.state?.status;
  return status === "active" || status === "cancelled" ? status : undefined;
}
export type DirectoryQuery = ReturnType<typeof readDirectoryQuery>;
export function changeDiagnostics(group: ChangeGroup) {
  const record = primaryRecord(group);
  return [
    ...group.diagnostics,
    ...(record?.diagnostics ?? []),
    ...(record?.taskGraph.diagnostics ?? []),
  ];
}
export const creatorName = (group: ChangeGroup) =>
  group.creator?.login ?? group.creator?.name ?? "";
export function readDirectoryQuery(q: Record<string, string>) {
  const labels = readLabelQuery(q);
  let creators: string[] = [];
  try {
    const value: unknown = JSON.parse(q.creator ?? "[]");
    if (
      Array.isArray(value) &&
      value.every(
        (v) =>
          typeof v === "string" &&
          v.trim() === v &&
          v.length > 0 &&
          !/[\r\n\u2028\u2029]/.test(v),
      )
    )
      creators = [...new Set(value)];
  } catch {}
  // 单个紧急程度仍沿用原参数值；多选以 JSON 数组表示。
  let urgencies: string[] = labels.urgency ? [labels.urgency] : [];
  try {
    const value: unknown = JSON.parse(q.urgency ?? "null");
    if (
      Array.isArray(value) &&
      value.every(
        (v) => typeof v === "string" && Object.hasOwn(URGENCY_LABELS, v),
      )
    )
      urgencies = [...new Set(value)];
  } catch {}
  let states: DirectoryScope[] = [
    DIRECTORY_STATES.includes(q.scope as DirectoryScope)
      ? (q.scope as DirectoryScope)
      : q.scope === "pendingRelease"
        ? "completed"
        : "active",
  ];
  try {
    const value: unknown = JSON.parse(q.states ?? "null");
    if (
      Array.isArray(value) &&
      value.every((v) => DIRECTORY_STATES.includes(v))
    )
      states = [...new Set(value)];
  } catch {}
  return {
    states,
    creatorSelf: q.creatorSelf === "1",
    labels: { ...labels, urgency: "" as const },
    urgencies,
    creators,
    scope: states.length === 1 ? states[0] : ("mixed" as const),
    group: (["status", "stage", "none"].includes(q.group)
      ? q.group
      : "status") as "status" | "stage" | "none",
    view: q.view === "board" ? ("board" as const) : ("list" as const),
    issues: q.issues === "1",
  };
}
export function directoryQueryParams(query: DirectoryQuery) {
  return {
    states: JSON.stringify(query.states),
    creatorSelf: query.creatorSelf ? "1" : null,
    types: query.labels.types.length
      ? JSON.stringify(query.labels.types)
      : null,
    noTypes: query.labels.noTypes ? "1" : null,
    urgency:
      query.urgencies.length > 1
        ? JSON.stringify(query.urgencies)
        : (query.urgencies[0] ?? null),
    creator: query.creators.length ? JSON.stringify(query.creators) : null,
    sort: query.labels.sortByUrgency ? "urgency" : null,
  };
}
export function matchesDirectoryScope(
  group: ChangeGroup,
  scope: DirectoryScope,
  delivery?: Delivery,
) {
  return classifyDirectoryState(group, delivery) === scope;
}

export function filterDirectoryChanges(
  groups: ChangeGroup[],
  query: DirectoryQuery,
  delivery: Record<string, Delivery> = {},
  identity?: DirectoryIdentity,
) {
  return groups.filter((group) => {
    const state = primaryRecord(group)?.state;
    return (
      (query.issues
        ? changeDiagnostics(group).length > 0 || !state
        : !!classifyDirectoryState(group, delivery[group.id]) &&
          (!query.states.length ||
            query.states.includes(
              classifyDirectoryState(group, delivery[group.id])!,
            ))) &&
      matchesLabels(state, query.labels) &&
      (!query.urgencies.length ||
        (!!state && query.urgencies.includes(state.urgency ?? "normal"))) &&
      ((!query.creators.length && !query.creatorSelf) ||
        query.creators.includes(creatorName(group)) ||
        (query.creatorSelf &&
          identity?.providerId === "github" &&
          !!group.creator?.subjectId &&
          group.creator.subjectId === identity.subjectId))
    );
  });
}
export function sortDirectoryChanges(groups: ChangeGroup[], urgency = false) {
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const rankOf = (g: ChangeGroup) => {
    const state = primaryRecord(g)?.state;
    return state ? rank[state.urgency ?? "normal"] : 4;
  };
  return groups.toSorted(
    (a, b) =>
      (urgency ? rankOf(a) - rankOf(b) : 0) ||
      (Date.parse(b.createdAt ?? "") || 0) -
        (Date.parse(a.createdAt ?? "") || 0) ||
      a.id.localeCompare(b.id),
  );
}
export function processingStatus(group: ChangeGroup) {
  const state = primaryRecord(group)?.state;
  return state?.waitingFor?.kind === "confirmation"
    ? "confirmation"
    : Object.values(state?.tasks ?? {}).some((t) => t.status === "blocked") ||
        state?.waitingFor
      ? "blocked"
      : "moving";
}
export function groupDirectoryChanges(
  groups: ChangeGroup[],
  query: DirectoryQuery,
  delivery: Record<string, Delivery> = {},
): { name: string; items: ChangeGroup[] }[] {
  const make = (name: string, items: ChangeGroup[]) => ({ name, items });
  if (
    query.issues ||
    query.group === "none" ||
    query.scope === "cancelled" ||
    query.scope === "archived"
  )
    return [make("", groups)];
  if (query.scope === "mixed")
    return DIRECTORY_STATES.flatMap((scope) => {
      const rows = groups.filter((g) =>
        matchesDirectoryScope(g, scope, delivery[g.id]),
      );
      return groupDirectoryChanges(
        rows,
        { ...query, states: [scope], scope },
        delivery,
      )
        .filter((g) => g.items.length)
        .map((g) =>
          make(
            g.name
              ? `${DIRECTORY_LABELS[scope]} · ${g.name}`
              : DIRECTORY_LABELS[scope],
            g.items,
          ),
        );
    });
  if (query.scope === "completed")
    return (
      [
        ["pendingIntegration", "待集成"],
        ["pendingRelease", "待发布"],
        ["unknown", "交付待核实"],
      ] as const
    )
      .map(([stage, name]) =>
        make(
          name,
          groups.filter((g) => (delivery[g.id]?.stage ?? "unknown") === stage),
        ),
      )
      .filter((g) => g.items.length);
  if (query.group === "stage")
    return STAGES.map((stage) =>
      make(
        STAGE_LABELS[stage],
        groups.filter((g) => primaryRecord(g)?.state?.stage === stage),
      ),
    ).filter((g) => g.items.length);
  return (
    [
      ["confirmation", "等待确认"],
      ["blocked", "受阻"],
      ["moving", "推进中"],
    ] as const
  )
    .map(([status, name]) =>
      make(
        name,
        groups.filter((g) => processingStatus(g) === status),
      ),
    )
    .filter((g) => g.items.length);
}
