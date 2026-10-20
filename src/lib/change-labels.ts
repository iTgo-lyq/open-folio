import { primaryRecord, type ChangeGroup, type ChangeState } from "./model.ts";

export const URGENCY_LABELS = {
  urgent: "紧急",
  high: "高",
  normal: "普通",
  low: "低",
} as const;
type Urgency = keyof typeof URGENCY_LABELS;
export type LabelQuery = {
  types: string[];
  noTypes: boolean;
  urgency: Urgency | "";
  sortByUrgency: boolean;
};

export function readLabelQuery(q: Record<string, string>): LabelQuery {
  let types: string[] = [];
  try {
    const value: unknown = JSON.parse(q.types ?? "[]");
    if (
      Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === "string" &&
          item.length > 0 &&
          item.trim() === item &&
          !/[\r\n\u2028\u2029]/.test(item),
      )
    )
      types = [...new Set(value)];
  } catch {}
  return {
    types,
    noTypes: q.noTypes === "1",
    urgency: Object.hasOwn(URGENCY_LABELS, q.urgency)
      ? (q.urgency as Urgency)
      : "",
    sortByUrgency: q.sort === "urgency",
  };
}

export function labelQueryParams(query: LabelQuery) {
  return {
    types: query.types.length ? JSON.stringify(query.types) : null,
    noTypes: query.noTypes ? "1" : null,
    urgency: query.urgency || null,
    sort: query.sortByUrgency ? "urgency" : null,
  };
}

export function matchesLabels(
  state: ChangeState | null | undefined,
  query: LabelQuery,
) {
  if (!query.types.length && !query.noTypes && !query.urgency) return true;
  if (!state) return false;
  const types = state.types ?? [];
  return (
    ((!query.types.length && !query.noTypes) ||
      query.types.some((type) => types.includes(type)) ||
      (query.noTypes && !types.length)) &&
    (!query.urgency || (state.urgency ?? "normal") === query.urgency)
  );
}

export function sortByUrgency(groups: ChangeGroup[]) {
  const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
  const rank = (group: ChangeGroup) => {
    const state = primaryRecord(group)?.state;
    return state ? ranks[state.urgency ?? "normal"] : 4;
  };
  return groups.toSorted((a, b) => rank(a) - rank(b));
}
