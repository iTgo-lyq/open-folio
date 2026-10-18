import { primaryRecord, type ChangeGroup } from "./model.ts";

// Reading relationships never change workflow validity or execution dependencies.
export function followUpIndex(changes: ChangeGroup[]) {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const roots = new Map<string, string>();
  const problems = new Map<string, string>();
  for (const change of changes) {
    if (roots.has(change.id)) continue;
    const path = new Set<string>();
    let cursor = change.id,
      root = change.id,
      problem: string | undefined;
    while (true) {
      if (path.has(cursor)) {
        problem = "延续关系存在自指或循环。";
        break;
      }
      if (roots.has(cursor)) {
        root = roots.get(cursor)!;
        problem = problems.get(cursor);
        break;
      }
      path.add(cursor);
      const record = primaryRecord(byId.get(cursor)!);
      const invalid = record?.diagnostics.find(
        (d) => d.code === "FOLLOW_UP_INVALID",
      );
      if (invalid) {
        problem = invalid.message;
        break;
      }
      const target = record?.state?.followUpOf;
      if (!target) {
        root = cursor;
        break;
      }
      const prior = byId.get(target);
      if (!prior) {
        problem = `前序 ${target} 不存在于当前已推送记录中。`;
        break;
      }
      if (!primaryRecord(prior)?.validCompleted) {
        problem = `前序 ${target} 尚未有效归档或来源不可判定。`;
        break;
      }
      cursor = target;
    }
    for (const id of path) {
      roots.set(id, problem ? id : root);
      if (problem) problems.set(id, problem);
    }
  }
  const groups = new Map<string, ChangeGroup[]>();
  for (const change of changes) {
    const root = roots.get(change.id)!;
    const members = groups.get(root) ?? [];
    members.push(change);
    groups.set(root, members);
  }
  for (const [root, members] of groups) {
    members.sort((a, b) => {
      if (a.id === root) return -1;
      if (b.id === root) return 1;
      const time = (g: ChangeGroup) => {
        const state = primaryRecord(g)?.state;
        return state?.status === "active"
          ? Infinity
          : Date.parse(
              state?.closure.archive?.at ?? state?.cancellation?.at ?? "",
            ) || 0;
      };
      return time(a) - time(b) || a.id.localeCompare(b.id);
    });
  }
  return { roots, groups, problems };
}

// Apply filters to members, not roots: an archived root must not hide an active follow-up.
export function matchingFollowUps(
  changes: ChangeGroup[],
  matched: ChangeGroup[],
) {
  const index = followUpIndex(changes);
  const visible = new Map<string, ChangeGroup[]>();
  for (const change of matched) {
    const root = index.roots.get(change.id)!;
    const members = visible.get(root) ?? [];
    members.push(change);
    visible.set(root, members);
  }
  return { ...index, visible };
}
