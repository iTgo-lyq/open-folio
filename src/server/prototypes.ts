import type { ChangeCandidate, PreviewEntry, Snapshot } from "../lib/model.ts";
import { primaryRecord } from "../lib/model.ts";
import type { PrototypeCatalog, PrototypeItem } from "../lib/prototypes.ts";
import { previewsSchema } from "./schema.ts";

// Inventory only: no HTML reads, Git commands or iframe execution for the gallery.
export async function prototypeCatalog(
  source: Snapshot,
  policy: Snapshot["prototype"],
  read: (candidate: ChangeCandidate) => Promise<unknown>,
): Promise<PrototypeCatalog> {
  const items = new Map<string, PrototypeItem>();
  const issues: PrototypeCatalog["issues"] = [];
  for (const group of source.changes) {
    const candidate = primaryRecord(group);
    const report = (message: string) =>
      issues.push({ changeId: group.id, changeTitle: group.title, message });
    if (!candidate) {
      let hasAssociations = false;
      let unreadable = false;
      for (const source of group.candidates) {
        if (
          source.state?.previews?.length ||
          source.diagnostics.some((d) => d.code === "PREVIEWS_INVALID")
        ) {
          hasAssociations = true;
          break;
        }
        if (source.state) continue;
        try {
          const value = await read(source);
          if (value && typeof value === "object" && "previews" in value) {
            const raw = value.previews;
            if (!Array.isArray(raw) || raw.length > 0) {
              hasAssociations = true;
              break;
            }
          }
        } catch {
          unreadable = true;
        }
      }
      if (hasAssociations) report("无法确定 Change 主来源，请先核对来源记录。");
      else if (unreadable)
        report("Change 来源记录无法读取，无法确认是否存在原型关联。");
      continue;
    }
    let raw: unknown = candidate.state?.previews;
    if (
      !candidate.state ||
      candidate.diagnostics.some((d) => d.code === "PREVIEWS_INVALID")
    ) {
      try {
        const value = await read(candidate);
        if (value && typeof value === "object" && "previews" in value)
          raw = value.previews;
      } catch {
        report("关联记录无法读取，请刷新后查看 Change 来源。");
        continue;
      }
    }
    if (raw === undefined || (Array.isArray(raw) && !raw.length)) continue;
    if (!candidate.state) {
      report("Change 核心记录不合法，暂不计入原型总览。");
      continue;
    }
    if (!Array.isArray(raw)) {
      report("原型关联应为数组，请检查 Change 来源。");
      continue;
    }
    const ids = new Map<unknown, number>();
    for (const entry of raw) ids.set(entry?.id, (ids.get(entry?.id) ?? 0) + 1);
    let invalid = 0;
    for (const value of raw) {
      const result = previewsSchema.safeParse([value]);
      if (!result.success || ids.get(value?.id) !== 1) {
        invalid++;
        continue;
      }
      const entry = result.data[0] as PreviewEntry;
      const key = `${entry.kind}:${entry.path}`;
      const item = items.get(key) ?? {
        key,
        path: entry.path,
        kind: entry.kind,
        title: entry.title,
        references: [],
      };
      item.references.push({
        changeId: group.id,
        changeTitle: candidate.title,
        status: candidate.state.status,
        archived: candidate.archived,
        recordCommit: candidate.commit,
        entry,
      });
      items.set(key, item);
    }
    if (invalid)
      report(`${invalid} 项关联格式不合法或 id 重复，其他有效入口仍可查看。`);
  }
  const rank = { active: 0, completed: 1, cancelled: 2 };
  for (const item of items.values()) {
    item.references.sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        a.changeId.localeCompare(b.changeId) ||
        a.entry.id.localeCompare(b.entry.id),
    );
    item.title = item.references[0].entry.title;
  }
  return {
    snapshotId: source.id,
    policy,
    items: [...items.values()].sort(
      (a, b) =>
        a.title.localeCompare(b.title, "zh-CN") || a.key.localeCompare(b.key),
    ),
    issues,
  };
}
