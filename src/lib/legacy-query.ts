// 原型验收删除的控件对应的旧链接参数：读到时移除或就近映射，不还原已删除的视图。
type Query = Record<string, string>;
type Patch = Record<string, string | null>;

const REMOVED_CHANGE_PARAMS = ["level", "taskStatus", "size", "stage", "wait"];

export function legacyChangesPatch(q: Query): Patch | null {
  const patch: Patch = {};
  for (const key of REMOVED_CHANGE_PARAMS) if (key in q) patch[key] = null;
  // Changes 列表的“关联能力”筛选已删除；Specs 页的 s 参数不受影响。
  if ("spec" in q) patch.spec = null;
  if (q.view && q.view !== "list" && q.view !== "board") patch.view = null;
  if (q.scope === "issues") Object.assign(patch, { scope: null, issues: "1" });
  if (q.scope === "pendingIntegration") patch.scope = null;
  if (q.scope === "pendingRelease") patch.scope = "completed";
  return Object.keys(patch).length ? patch : null;
}

export function legacyPrototypesPatch(q: Query): Patch | null {
  return "pkind" in q ? { pkind: null } : null;
}
