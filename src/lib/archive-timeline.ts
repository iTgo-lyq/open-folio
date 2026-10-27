import type { ChangeGroup, Delivery, PullRequest } from "./model.ts";

export type ArchiveBatch = {
  key: string;
  pr?: PullRequest;
  items: ChangeGroup[];
};
export type ArchiveDay = {
  key: string;
  label: string;
  batches: ArchiveBatch[];
  count: number;
};

/** Inputs are already filtered; only the server's verified PR reference supplies dates. */
export function archiveTimeline(
  changes: ChangeGroup[],
  delivery: Record<string, Delivery> = {},
  timeZone?: string,
): ArchiveDay[] {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const label = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const batches = new Map<string, ArchiveBatch>();
  for (const change of changes) {
    const d = delivery[change.id];
    const candidate =
      d?.stage === "releaseMerged"
        ? d.releasePrs.find((pr) => pr.number === d.releaseMergedPrNumber)
        : undefined;
    const pr =
      candidate?.state === "merged" &&
      candidate.mergedAt &&
      Number.isFinite(Date.parse(candidate.mergedAt))
        ? candidate
        : undefined;
    const key = pr ? `pr:${pr.number}` : "unknown";
    const batch = batches.get(key) ?? { key, pr, items: [] };
    batch.items.push(change);
    batches.set(key, batch);
  }
  const days = new Map<string, ArchiveDay>();
  for (const batch of [...batches.values()].sort(
    (a, b) =>
      (b.pr ? Date.parse(b.pr.mergedAt!) : -Infinity) -
        (a.pr ? Date.parse(a.pr.mergedAt!) : -Infinity) ||
      (b.pr?.number ?? 0) - (a.pr?.number ?? 0),
  )) {
    const at = batch.pr ? new Date(batch.pr.mergedAt!) : undefined;
    const key = at ? date.format(at) : "unknown";
    const day = days.get(key) ?? {
      key,
      label: at ? label.format(at) : "合入时间未知",
      batches: [],
      count: 0,
    };
    day.batches.push(batch);
    day.count += batch.items.length;
    days.set(key, day);
  }
  return [...days.values()];
}
