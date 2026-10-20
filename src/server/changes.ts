import type {
  ChangeCandidate,
  ChangeGroup,
  ChangeState,
  Diagnostic,
  Relation,
} from "../lib/model.ts";
import { primaryRecord } from "../lib/model.ts";
import type { Collected } from "./indexer.ts";
import type { GitReader } from "./git.ts";
import {
  branchName,
  changeSchema,
  followUpTitleSchema,
  identity,
  previewsSchema,
  validDate,
} from "./schema.ts";
import { cyclicNodes, parsePlan } from "./plan.ts";
import { inspectMarkdown, resolveDocumentLink } from "../lib/markdown.ts";
const issue = (code: string, message: string, path?: string): Diagnostic => ({
  code,
  message,
  path,
  severity: "error",
});
function semantics(c: ChangeCandidate, data: Collected) {
  const s = c.state!;
  const add = (code: string, message: string, field = "") =>
    c.diagnostics.push(
      issue(code, message, `${c.directory}/change.json${field}`),
    );
  const directoryId = c.directory.split("/").at(-1)!;
  if (
    c.archived
      ? directoryId.slice(11) !== s.id || !validDate(directoryId.slice(0, 10))
      : directoryId !== s.id
  )
    add("DIRECTORY_ID", "目录与声明 id 不匹配，或归档日期无效。");
  if (s.size === "small" && ["technical", "plan"].includes(s.stage))
    add("STAGE_ROUTE", "small 的路线不包含技术或计划阶段。", "/stage");
  if (["medium", "xlarge"].includes(s.size) && s.stage === "plan")
    add("STAGE_ROUTE", "该规模将技术与计划合并，不单独进入 plan。", "/stage");
  if (
    s.size === "xlarge" &&
    (Object.keys(s.tasks).length || s.dependsOn?.length || s.parent)
  )
    add(
      "XLARGE_SHAPE",
      "xlarge 使用子 Change，不应有实现任务、前置 Change 或父 Change。",
    );
  if (s.size !== "xlarge" && s.children?.length)
    add("CHILDREN_SHAPE", "只有 xlarge 可以声明子 Change。", "/children");
  if (s.status !== "cancelled") {
    const needed =
      s.stage === "requirement" || s.size === "small"
        ? []
        : s.stage === "technical"
          ? ["requirement"]
          : s.stage === "plan"
            ? ["requirement", "technical"]
            : ["requirement", "technical", "plan"];
    for (const key of needed)
      if (!s.confirmations[key as keyof ChangeState["confirmations"]])
        add(
          "CONFIRMATION_MISSING",
          `当前阶段缺少 ${key} 确认记录。`,
          `/confirmations/${key}`,
        );
    if (
      s.stage === "close" &&
      Object.values(s.tasks).some((t) => t.status !== "done")
    )
      add("TASKS_UNFINISHED", "关闭阶段仍有未完成任务。", "/tasks");
  }
  if (
    s.status === "completed" &&
    s.size !== "xlarge" &&
    c.taskGraph.status !== "valid"
  )
    add("PLAN_INVALID", "完成记录缺少 Plan，或显式执行顺序无效。");
  const steps = ["verification", "acceptance", "specs", "archive"] as const;
  for (let i = 0; i < steps.length; i++) {
    const v = s.closure[steps[i]];
    if (!v) continue;
    if (s.stage !== "close")
      add(
        "CLOSURE_STAGE",
        "存在关闭记录，但当前阶段不是 close。",
        `/closure/${steps[i]}`,
      );
    if (
      i &&
      (!s.closure[steps[i - 1]] || s.closure.verification?.result !== "passed")
    )
      add(
        "CLOSURE_ORDER",
        "关闭记录缺少此前成功步骤。",
        `/closure/${steps[i]}`,
      );
    if (
      i &&
      s.closure[steps[i - 1]] &&
      Date.parse(v.at) < Date.parse(s.closure[steps[i - 1]]!.at)
    )
      add("CLOSURE_TIME", "关闭步骤的时间顺序矛盾。", `/closure/${steps[i]}`);
  }
  if (s.status === "completed") {
    if (
      s.stage !== "close" ||
      s.closure.verification?.result !== "passed" ||
      steps.some((k) => !s.closure[k]) ||
      s.waitingFor
    )
      add("COMPLETION_INVALID", "完成声明缺少有效关闭四步，或仍在等待。");
    if (!c.archived || s.closure.archive?.path !== c.directory)
      add(
        "ARCHIVE_PATH",
        "完成声明未对应当前归档目录。",
        "/closure/archive/path",
      );
    if (
      data.documents.some(
        (d) =>
          d.branch === c.branch &&
          d.path.startsWith(`docs/project/changes/${s.id}/`),
      )
    )
      add(
        "LIVE_DIRECTORY_REMAINS",
        "该分支仍保留原 Change 目录，不满足归档条件。",
      );
  } else if (c.archived)
    add("ARCHIVE_STATUS", "归档目录内的记录未声明完成。", "/status");
  c.validCompleted =
    s.status === "completed" &&
    !c.diagnostics.some((d) => d.severity === "error");
}
export async function indexChanges(
  data: Collected,
  reader: Pick<GitReader, "ancestor" | "changeCreationTimes">,
  signal?: AbortSignal,
): Promise<ChangeGroup[]> {
  const groups = new Map<string, ChangeGroup>(
    data.routes.map((route) => [
      route.id,
      {
        id: route.id,
        title: route.id,
        primary: null,
        candidates: [],
        relations: [],
        source: {
          entryBranch: data.collaborationBranch!,
          entryPath: route.entryPath,
          entryCommit: data.branches.find(
            (b) => b.name === data.collaborationBranch,
          )!.commit,
          recordBranch: route.branch,
        },
        diagnostics: route.errors.map((message) =>
          issue("SOURCE_INVALID", message, route.entryPath),
        ),
      },
    ]),
  );
  for (const doc of data.documents) {
    const m = /^docs\/project\/(changes|archive)\/([^/]+)\/change\.json$/.exec(
      doc.path,
    );
    if (!m) continue;
    const directory = doc.path.slice(0, -"/change.json".length),
      fallbackId =
        m[1] === "archive" ? m[2].replace(/^\d{4}-\d{2}-\d{2}-/, "") : m[2];
    const route = data.routes.find((r) => r.id === fallbackId);
    if (!route || doc.branch !== route.branch || route.errors.length) continue;
    let raw: unknown;
    const diagnostics: Diagnostic[] = [...doc.diagnostics];
    try {
      raw = JSON.parse(
        doc.readable ? data.blobs.get(doc.blob)!.toString() : "",
      );
    } catch {
      diagnostics.push(
        issue(
          "JSON_INVALID",
          "无法读取合法的 change.json，请查看来源文件。",
          doc.path,
        ),
      );
    }
    const object =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const id = fallbackId;
    if (object.id !== fallbackId)
      diagnostics.push(
        issue("DIRECTORY_ID", "目标记录 id 与集中入口不匹配。", doc.path),
      );
    const owner = branchName.safeParse(object.branch).success
      ? (object.branch as string)
      : undefined;
    // Invalid optional reading extensions must not revoke workflow completion.
    let parsed = changeSchema.safeParse(raw);
    if (!parsed.success) {
      const core = { ...object };
      const warnings: Diagnostic[] = [];
      for (const [key, schema, code, message] of [
        [
          "previews",
          previewsSchema,
          "PREVIEWS_INVALID",
          "原型关联格式不合法，请检查 previews；其余流程仍可阅读。",
        ],
        [
          "followUpOf",
          identity,
          "FOLLOW_UP_INVALID",
          "前序关联格式不合法，请检查 followUpOf；原交付事实仍可阅读。",
        ],
        [
          "followUpTitle",
          followUpTitleSchema,
          "FOLLOW_UP_TITLE_INVALID",
          "分组标题格式不合法，请检查 followUpTitle；延续关系与原交付事实仍可阅读。",
        ],
      ] as const) {
        if (!Object.hasOwn(core, key) || schema.safeParse(core[key]).success)
          continue;
        delete core[key];
        warnings.push({
          ...issue(code, message, `${doc.path}#/${key}`),
          severity: "warning",
        });
      }
      const fallback = changeSchema.safeParse(core);
      if (fallback.success) {
        diagnostics.push(...warnings);
        parsed = fallback;
      }
    }
    if (!parsed.success && raw !== undefined)
      for (const e of parsed.error.issues)
        diagnostics.push(
          issue(
            "SCHEMA_INVALID",
            `${e.path.join("/") || "/"}：${e.message}`,
            `${doc.path}#/${e.path.map((x) => String(x).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`,
          ),
        );
    const state = parsed.success ? parsed.data : null;
    const refs = data.documents.filter(
      (d) => d.branch === doc.branch && d.path.startsWith(`${directory}/`),
    );
    const plan = refs.find(
      (d) => d.path === `${directory}/plan.md` && d.readable,
    );
    const c: ChangeCandidate = {
      key: doc.id,
      id,
      title:
        typeof object.title === "string" && object.title.trim()
          ? object.title
          : id,
      owner,
      branch: doc.branch,
      commit: doc.commit,
      directory,
      archived: m[1] === "archive",
      jsonDocumentId: doc.id,
      documentIds: refs.map((d) => d.id),
      state,
      diagnostics,
      validCompleted: false,
      taskGraph: state
        ? parsePlan(
            state,
            plan ? data.blobs.get(plan.blob)!.toString() : undefined,
            plan?.id,
          )
        : { status: "invalid", edges: {}, diagnostics: [] },
      relatedSpecs: [],
      specReferences: [],
    };
    if (state) semantics(c, data);
    // Only explicit references associate Specs; title similarity never does.
    const linked = new Set<string>();
    for (const d of refs.filter((d) => d.kind === "markdown" && d.readable)) {
      const body = data.blobs.get(d.blob)!.toString();
      const paths = inspectMarkdown(body).links.flatMap((link) => {
        const r = resolveDocumentLink(d.path, link.url);
        return r.kind === "internal" ? [{ path: r.path, line: link.line }] : [];
      });
      paths.push(
        ...[
          ...body.matchAll(/docs\/project\/specs\/[a-z0-9/-]+\/spec\.md/g),
        ].map((m) => ({
          path: m[0],
          line: body.slice(0, m.index).split("\n").length,
        })),
      );
      for (const { path, line } of paths)
        if (
          data.documents.some(
            (ref) =>
              ref.branch === data.collaborationBranch && ref.path === path,
          ) &&
          /^docs\/project\/specs\/.+\/spec.md$/.test(path)
        ) {
          const specId = path.slice(
            "docs/project/specs/".length,
            -"/spec.md".length,
          );
          linked.add(specId);
          if (
            !c.specReferences.some(
              (r) =>
                r.specId === specId && r.documentId === d.id && r.line === line,
            )
          )
            c.specReferences.push({ specId, documentId: d.id, line });
        }
    }
    c.relatedSpecs = [...linked];
    if (!groups.has(id))
      groups.set(id, {
        id,
        title: c.title,
        primary: null,
        candidates: [],
        diagnostics: [],
        relations: [],
      });
    groups.get(id)!.candidates.push(c);
  }
  for (const g of groups.values()) {
    const route = data.routes.find((r) => r.id === g.id)!;
    const owns = g.candidates.filter(
      (c) =>
        !c.diagnostics.some((d) => d.code === "DIRECTORY_ID") &&
        (route.kind === "archive"
          ? c.archived && c.validCompleted
          : c.owner === c.branch),
    );
    if (
      !route.errors.length &&
      g.candidates.length === 1 &&
      owns.length === 1
    ) {
      g.primary = owns[0].key;
      g.title = owns[0].title;
    } else if (!g.diagnostics.length)
      g.diagnostics.push(
        issue(
          "SOURCE_INVALID",
          g.candidates.length > 1
            ? "目标分支存在重复 live/archive 记录，来源不可判定。"
            : "目标分支缺少匹配的完整记录，或记录身份、归档状态无效；不采用集中旧副本。",
          route.entryPath,
        ),
      );
  }
  const edges: Record<string, string[]> = {};
  for (const g of groups.values()) {
    const c = primaryRecord(g),
      s = c?.state;
    if (!c || !s) continue;
    edges[g.id] = [...(s.dependsOn ?? []), ...(s.children ?? [])];
    const links: [Relation["kind"], string][] = [
      ...(s.dependsOn ?? []).map(
        (x) => ["dependency", x] as [Relation["kind"], string],
      ),
      ...(s.children ?? []).map(
        (x) => ["child", x] as [Relation["kind"], string],
      ),
      ...(s.parent ? [["parent", s.parent] as [Relation["kind"], string]] : []),
    ];
    for (const [kind, target] of links) {
      const other = groups.get(target),
        t = other ? primaryRecord(other) : null;
      const r: Relation = {
        kind,
        target,
        exists: !!other,
        process: !t?.state
          ? "unknown"
          : t.validCompleted ||
              (kind === "child" &&
                t.state.status === "cancelled" &&
                !t.diagnostics.length)
            ? "satisfied"
            : "unsatisfied",
        ancestry: "unknown",
        diagnostics: [],
      };
      if (!other) r.diagnostics.push("目标不存在于已推送记录中。");
      else if (!t?.state) r.diagnostics.push("目标主来源或状态不可判定。");
      if (target === s.id) r.diagnostics.push("不能引用自身。");
      if (kind === "child" && t?.state?.parent !== s.id)
        r.diagnostics.push("子项未反向声明当前父 Change。");
      if (
        kind === "parent" &&
        (t?.state?.size !== "xlarge" || !t.state.children?.includes(s.id))
      )
        r.diagnostics.push("父项未以 xlarge 声明当前子 Change。");
      if (kind === "dependency" && target === s.parent)
        r.diagnostics.push("子项不能依赖等待自己完成的父项。");
      if (kind === "child" && t?.state?.size === "xlarge")
        r.diagnostics.push("不能嵌套 xlarge。");
      if (r.diagnostics.length)
        g.diagnostics.push(
          issue(
            "RELATION_INVALID",
            `${kind === "dependency" ? "前置" : kind === "child" ? "子项" : "父项"} ${target}：${r.diagnostics.join(" ")}`,
            `${c.directory}/change.json#/${kind === "dependency" ? "dependsOn" : kind === "child" ? "children" : "parent"}`,
          ),
        );
      g.relations.push(r);
    }
  }
  const cycles = cyclicNodes(edges);
  for (const g of groups.values()) {
    if (cycles.has(g.id))
      g.diagnostics.push(
        issue("RELATION_CYCLE", "前置与父等子关系构成循环，不能判为可执行。"),
      );
    const c = primaryRecord(g);
    if (c && g.diagnostics.length) c.validCompleted = false;
  }
  const prerequisite = (r: Relation) => {
    const target = groups.get(r.target),
      c = target ? primaryRecord(target) : null;
    if (
      r.diagnostics.length ||
      !target ||
      target.diagnostics.length ||
      !c?.state ||
      c.diagnostics.some((d) => d.severity === "error")
    )
      return "unknown" as const;
    return c.validCompleted ||
      (r.kind === "child" && c.state.status === "cancelled")
      ? ("satisfied" as const)
      : ("unsatisfied" as const);
  };
  // Completion can only lose validity. Settle the entire graph before displaying
  // a dependent's prerequisite; traversal order must not change the conclusion.
  let changed: boolean;
  do {
    changed = false;
    for (const g of groups.values()) {
      const c = primaryRecord(g);
      if (!c?.validCompleted) continue;
      if (
        g.relations.some(
          (r) => r.kind !== "parent" && prerequisite(r) !== "satisfied",
        )
      ) {
        c.validCompleted = false;
        changed = true;
        c.diagnostics.push(
          issue(
            "COMPLETION_RELATIONS",
            "完成声明仍有未满足或不可判定的前置／子项关系。",
            `${c.directory}/change.json`,
          ),
        );
      }
    }
  } while (changed);
  for (const g of groups.values()) {
    const c = primaryRecord(g);
    if (
      c?.state?.size === "xlarge" &&
      c.state.stage === "close" &&
      g.relations.some(
        (r) => r.kind === "child" && prerequisite(r) !== "satisfied",
      )
    ) {
      c.diagnostics.push(
        issue(
          "CHILDREN_UNFINISHED",
          "关闭中的父 Change 仍有未完成或不可判定的子项。",
          `${c.directory}/change.json#/children`,
        ),
      );
      c.validCompleted = false;
    }
  }
  for (const g of groups.values()) {
    const c = primaryRecord(g);
    for (const r of g.relations) {
      r.process = r.kind === "parent" ? "unknown" : prerequisite(r);
      const target = groups.get(r.target),
        t = target ? primaryRecord(target) : null;
      if (
        r.process === "satisfied" &&
        t?.validCompleted &&
        c &&
        (await reader.ancestor(t.commit, c.commit, signal))
      )
        r.ancestry = "found";
    }
  }
  const creationTimes = await reader.changeCreationTimes(
    data.branches.map((branch) => branch.commit),
    signal,
  );
  for (const group of groups.values()) {
    const time = creationTimes.get(group.id);
    if (time !== undefined) group.createdAt = new Date(time).toISOString();
  }
  return [...groups.values()].sort(compareChangeCreation);
}

export function compareChangeCreation(a: ChangeGroup, b: ChangeGroup) {
  const aTime = Date.parse(a.createdAt ?? "");
  const bTime = Date.parse(b.createdAt ?? "");
  if (Number.isFinite(aTime) !== Number.isFinite(bTime))
    return Number.isFinite(aTime) ? -1 : 1;
  return bTime - aTime || a.id.localeCompare(b.id);
}
