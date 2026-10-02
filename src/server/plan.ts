import type { ChangeState, TaskGraph } from "../lib/model.ts";
import { inspectMarkdown, nodeText } from "../lib/markdown.ts";
export function cyclicNodes(edges: Record<string, string[]>) {
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    active = new Set<string>(),
    cycles = new Set<string>();
  const adjacent = (id: string) => (Object.hasOwn(edges, id) ? edges[id] : []);
  let next = 0;
  function visit(id: string) {
    index.set(id, next);
    low.set(id, next++);
    stack.push(id);
    active.add(id);
    for (const target of adjacent(id)) {
      if (!index.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (active.has(target))
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) !== index.get(id)) return;
    const component: string[] = [];
    let node: string;
    do {
      node = stack.pop()!;
      active.delete(node);
      component.push(node);
    } while (node !== id);
    if (component.length > 1 || adjacent(id).includes(id))
      component.forEach((n) => cycles.add(n));
  }
  Object.keys(edges).forEach((id) => {
    if (!index.has(id)) visit(id);
  });
  return cycles;
}
export function parsePlan(
  state: ChangeState,
  body?: string,
  documentId?: string,
): TaskGraph {
  const g: TaskGraph = {
    status: state.size === "xlarge" ? "not-applicable" : "missing",
    edges: {},
    diagnostics: [],
    documentId,
  };
  if (state.size === "xlarge" || body === undefined) return g;
  const nodes = inspectMarkdown(body).tree.children ?? [];
  const sections = nodes.flatMap((n, i) =>
    n.type === "heading" && nodeText(n).trim() === "执行顺序" ? [i] : [],
  );
  const tables: typeof nodes = [];
  for (const start of sections) {
    const depth = nodes[start].depth!;
    for (
      let i = start + 1;
      i < nodes.length &&
      !(nodes[i].type === "heading" && nodes[i].depth! <= depth);
      i++
    ) {
      const n = nodes[i];
      if (n.type !== "table") continue;
      const headers =
        n.children?.[0]?.children?.map(nodeText).map((s) => s.trim()) ?? [];
      if (headers.includes("任务") && headers.includes("前置任务"))
        tables.push(n);
    }
  }
  const problem = (message: string, line?: number) =>
    g.diagnostics.push({
      code: "PLAN_DEPENDENCIES",
      message,
      line,
      severity: "warning",
    });
  if (sections.length !== 1 || tables.length !== 1)
    problem(
      "需要唯一的“执行顺序”章节和包含“任务 / 前置任务”的表格，当前依赖不可判定。",
    );
  else {
    const table = tables[0];
    g.line = table.position?.start.line;
    const rows = table.children!,
      heads = rows[0].children!.map(nodeText).map((s) => s.trim()),
      taskAt = heads.indexOf("任务"),
      prevAt = heads.indexOf("前置任务");
    if (
      heads.filter((x) => x === "任务").length !== 1 ||
      heads.filter((x) => x === "前置任务").length !== 1
    )
      problem("表头存在重复列。", g.line);
    for (const row of rows.slice(1)) {
      const cells = row.children!.map(nodeText).map((s) => s.trim()),
        id = cells[taskAt],
        prev = cells[prevAt],
        line = row.position?.start.line;
      if (!/^T[1-9][0-9]*$/.test(id ?? "") || !Object.hasOwn(state.tasks, id)) {
        problem(`任务 ${id || "（空）"} 不在 change.json 中。`, line);
        continue;
      }
      if (Object.hasOwn(g.edges, id)) {
        problem(`${id} 出现多行。`, line);
        continue;
      }
      const deps =
        prev === "无" ? [] : (prev ?? "").split(/[、,，\s]+/).filter(Boolean);
      if (
        !prev ||
        (prev !== "无" && !deps.length) ||
        deps.some(
          (x) => !/^T[1-9][0-9]*$/.test(x) || !Object.hasOwn(state.tasks, x),
        )
      )
        problem(`${id} 的前置任务为空或引用了非法编号。`, line);
      if (new Set(deps).size !== deps.length || deps.includes(id))
        problem(`${id} 存在重复或自身依赖。`, line);
      g.edges[id] = deps;
    }
    for (const id of Object.keys(state.tasks))
      if (!Object.hasOwn(g.edges, id))
        problem(`${id} 没有执行顺序记录。`, g.line);
    if (cyclicNodes(g.edges).size) problem("任务前置关系存在循环。", g.line);
  }
  g.status = g.diagnostics.length ? "invalid" : "valid";
  return g;
}
