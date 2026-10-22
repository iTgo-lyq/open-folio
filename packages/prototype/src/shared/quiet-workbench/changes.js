// ③ Changes：一行工具栏（范围 + 筛选 + 显示），按“等待确认 / 受阻 / 推进中”分组。
const stageIndex = (c) => STAGES.findIndex(([k]) => k === c.stage);
const stageName = (c) => (c.stage === "close" && c.status === "active" ? "验收" : STAGES.find(([k]) => k === c.stage)?.[1] || "—");
function stageDots(c) {
  if (c.status === "unknown") return `<span class="stage-dots issue" aria-hidden="true">${icon("warning")}</span>`;
  const i = stageIndex(c),
    done = c.status === "completed";
  return `<span class="stage-dots ${done ? "done" : c.status === "cancelled" ? "cancelled" : ""}" aria-hidden="true">${STAGES.map((_, n) => `<i class="${done || n < i ? "past" : n === i ? "now" : ""}"></i>`).join("")}</span>`;
}
const blockedTasks = (c) => c.tasks.filter((t) => t.status === "blocked");
const doneTasks = (c) => c.tasks.filter((t) => t.status === "done");
function attention(c) {
  if (c.waiting?.kind === "confirmation") return "confirm";
  if (blockedTasks(c).length || c.waiting) return "blocked";
  return "moving";
}
function statusText(c) {
  if (c.status === "completed") return `已归档 · ${c.archived}`;
  if (c.status === "cancelled") return `已取消 · ${c.cancelled}`;
  if (c.status === "unknown") return "记录无法完整读取";
  if (c.waiting?.kind === "confirmation") return `${stageName(c)} · 等待确认`;
  if (c.waiting?.kind === "dependency") return `${stageName(c)} · 等待依赖`;
  if (blockedTasks(c).length) return `${stageName(c)} · ${blockedTasks(c).length} 个任务受阻`;
  return stageName(c);
}
const urgencyFlag = (c) => (c.urgency === "urgent" || c.urgency === "high" ? `<span class="flag ${c.urgency}" title="紧急程度：${URGENCY[c.urgency]}">${icon("flag")}<span>${URGENCY[c.urgency]}</span></span>` : "");
const labelTags = (c) => c.labels.map((l) => tag(l)).join("");
function deliveryTag(c, withPr = true) {
  const d = c.delivery;
  if (!d) return c.status === "completed" ? tag("交付待核实", "amber") : "";
  if (!d.stage) {
    const pr = d.changePrs.find((p) => p.state === "open");
    return pr && withPr ? `<span class="pr-chip">${icon("merge")}#${pr.n}${pr.draft ? " 草稿" : ""}</span>` : "";
  }
  const [label, tone] = DELIVERY[d.stage],
    release = d.releasePrs.find((p) => p.state === "merged");
  return `${tag(release?.version && d.stage === "releaseMerged" ? `${label} ${release.version}` : label, tone)}${withPr && d.stage === "pendingIntegration" ? `<span class="pr-chip">${icon("merge")}#${d.changePrs[0].n}</span>` : ""}`;
}
function taskCell(c) {
  if (!c.tasks.length) return `<span class="faint no-tasks">—</span>`;
  const b = blockedTasks(c).length;
  return `<span class="task-count ${b ? "bad" : ""}">${b ? icon("blocked") : ring(doneTasks(c).length / c.tasks.length)}${doneTasks(c).length}/${c.tasks.length}</span>`;
}
const ring = (p) => `<svg class="ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="6.2" class="ring-fill" stroke-dasharray="${(p * 39).toFixed(1)} 39"/></svg>`;
const SCOPES = [
  ["active", "进行中"],
  ["completed", "已完成"],
  ["cancelled", "已取消"],
];
const inScope = (c, s) => c.status === s;
function filtered(list) {
  const f = S.changes;
  let out = list.filter((c) => (!f.types.length || c.labels.some((l) => f.types.includes(l))) && (!f.urgency.length || f.urgency.includes(c.urgency || "normal")) && (!f.creators.length || f.creators.includes(c.creator)));
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  out.sort((a, b) => (f.sort === "urgency" ? rank[a.urgency || "normal"] - rank[b.urgency || "normal"] : 0) || b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
  return out;
}
const filterCount = () => S.changes.types.length + S.changes.urgency.length + S.changes.creators.length;
function changesView() {
  if (S.path[1]) return changeDetailView(S.path[1]);
  const gate = sceneGate();
  if (gate) return gate;
  const all = changesOf(),
    f = S.changes;
  const wrap = (inner) => ({ body: `<div class="page" data-scroll="changes-${f.scope}"><div class="page-inner wide">${inner}</div></div>` });
  if (S.scene === "empty" || !all.length)
    return wrap(`<header class="page-head"><h1>Changes</h1></header>${empty("还没有 Change", "使用 SpecTrail 在协作分支创建并推送 Change 后，会出现在这里。", "", "change")}`);
  const issues = all.filter((c) => c.status === "unknown");
  const count = (s) => all.filter((c) => inScope(c, s)).length;
  const scoped = f.issues ? issues : all.filter((c) => inScope(c, f.scope));
  const list = filtered(scoped);
  const board = f.view === "board" && f.scope === "active" && !f.issues && !mobile();
  const head = `<header class="page-head"><h1>Changes</h1></header>`;
  const bar = `<div class="list-bar"><div class="seg" role="tablist" aria-label="范围">${SCOPES.map(([k, l]) => `<button role="tab" aria-selected="${!f.issues && f.scope === k}" data-action="scope" data-arg="${k}" data-key="scope:${k}" tabindex="${!f.issues && f.scope === k ? 0 : -1}">${l}<span class="count">${count(k)}</span></button>`).join("")}</div><span class="grow"></span>${mobile() ? `${ibtn("筛选", "filter-menu", "filter", { popup: "dialog", key: "filter-menu", cls: filterCount() ? "on" : "" })}${ibtn("显示", "display-menu", "display", { popup: "dialog", key: "display-menu" })}` : `${btn("筛选", "filter-menu", { icon: "filter", kind: `ghost ${filterCount() ? "on" : ""}`, popup: "dialog", key: "filter-menu", badge: filterCount() || "" })}${btn("显示", "display-menu", { icon: "display", kind: "ghost", popup: "dialog", key: "display-menu" })}`}</div>`;
  const chips = filterCount()
    ? `<div class="chips" aria-label="已选筛选">${[...f.types.map((v) => ["types", v, `类型：${v}`]), ...f.urgency.map((v) => ["urgency", v, `紧急程度：${URGENCY[v]}`]), ...f.creators.map((v) => ["creators", v, `创建者：${person(v).name}`])].map(([k, v, l]) => `<button class="chip" data-action="drop-filter" data-arg="${k}:${v}" data-key="chip:${k}:${v}" aria-label="移除筛选 ${esc(l)}">${esc(l)}${icon("x")}</button>`).join("")}<button class="chip-clear" data-action="clear-filters" data-key="clear-filters">清除</button></div>`
    : "";
  const banner = issues.length && !f.issues && f.scope === "active" ? `<div class="banner warn">${icon("warning")}<span class="grow">${issues.length} 个 Change 的记录无法完整读取</span>${btn("查看", "show-issues", { kind: "sm" })}</div>` : f.issues ? `<div class="banner warn">${icon("warning")}<span class="grow">正在查看无法完整读取的记录</span>${btn("返回列表", "hide-issues", { kind: "sm" })}</div>` : "";
  let content;
  if (!list.length) content = empty("没有符合条件的 Change", "调整或清除筛选后再看看。", btn("清除筛选", "clear-filters", { key: "clear-empty" }), "filter");
  else if (board) content = changeBoard(list);
  else content = changeTable(list, f.issues ? "issues" : f.scope);
  return wrap(head + offlineBanner() + bar + chips + banner + content);
}
function groupsFor(list, scope) {
  const g = S.changes.group;
  if (scope === "active" && g === "status")
    return [["confirm", "等待确认"], ["blocked", "受阻"], ["moving", "推进中"]].map(([k, l]) => [l, list.filter((c) => attention(c) === k)]);
  if (scope === "active" && g === "stage") return STAGES.map(([k, l]) => [k === "close" ? "验收" : l, list.filter((c) => c.stage === k)]);
  if (scope === "completed") return [["待发布", list.filter((c) => c.delivery?.stage === "pendingRelease")], ["已发布", list.filter((c) => c.delivery?.stage === "releaseMerged")], ["交付待核实", list.filter((c) => !c.delivery || c.delivery.stage === "unknown")]];
  return [["", list]];
}
function changeTable(list, scope) {
  const cols = scope === "completed" ? ["交付", "归档"] : scope === "cancelled" ? ["原因", "取消"] : scope === "issues" ? ["问题", ""] : ["阶段", "任务"];
  const row = (c) => {
    const second =
      scope === "completed" ? `<span class="cell-a">${deliveryTag(c, false)}</span><span class="cell-b muted">${c.archived}</span>`
      : scope === "cancelled" ? `<span class="cell-a muted clamp">${esc(c.cancelReason)}</span><span class="cell-b muted">${c.cancelled}</span>`
      : scope === "issues" ? `<span class="cell-a issue-text clamp">${esc(c.issue)}</span><span class="cell-b"></span>`
      : `<span class="cell-a stage-cell">${stageDots(c)}<span>${stageName(c)}</span></span><span class="cell-b">${taskCell(c)}</span>`;
    const parent = c.followUpOf ? changeById(c.followUpOf) : null;
    return `<li><a class="change-row" href="#/changes/${c.id}" data-action="open-change" data-arg="${c.id}" data-key="row:${c.id}"><span class="cell-main"><span class="row-title">${urgencyFlag(c)}<span class="title-text">${esc(c.title)}</span></span><span class="row-meta"><code>${c.id}</code>${labelTags(c)}${parent ? `<span class="follow">${icon("followup")}延续“${esc(parent.groupTitle || parent.title)}”</span>` : ""}${scope === "active" ? deliveryTag(c) : ""}${c.waiting && scope === "active" ? `<span class="wait-text">${icon(c.waiting.kind === "confirmation" ? "clock" : "pause")}${esc(c.waiting.summary)}</span>` : ""}${blockedTasks(c).length && scope === "active" ? `<span class="wait-text bad">${icon("blocked")}${esc(blockedTasks(c)[0].reason)}</span>` : ""}</span></span>${second}<span class="cell-who">${avatar(c.creator, "sm")}<span>${esc(person(c.creator).name)}</span></span><span class="cell-date">${dateLabel(c.created)}</span></a></li>`;
  };
  const groups = groupsFor(list, scope).filter(([, items]) => items.length);
  return `<div class="table" role="region" aria-label="Change 列表"><div class="table-head" aria-hidden="true"><span class="cell-main">Change</span><span class="cell-a">${cols[0]}</span><span class="cell-b">${cols[1]}</span><span class="cell-who">创建者</span><span class="cell-date">创建</span></div>${groups.map(([label, items]) => `${label ? `<h2 class="group-h">${label}<span class="count">${items.length}</span></h2>` : ""}<ul class="rows" role="list">${items.map(row).join("")}</ul>`).join("")}</div>`;
}
function changeBoard(list) {
  return `<div class="board" role="region" aria-label="按阶段看板（只读）">${STAGES.map(([k, l]) => {
    const items = list.filter((c) => c.stage === k);
    return `<section class="board-col" aria-label="${k === "close" ? "验收" : l}"><h2 class="board-h">${k === "close" ? "验收" : l}<span class="count">${items.length}</span></h2>${items.map((c) => `<a class="card" href="#/changes/${c.id}" data-action="open-change" data-arg="${c.id}" data-key="card:${c.id}"><span class="row-title">${urgencyFlag(c)}<span class="title-text">${esc(c.title)}</span></span><span class="row-meta">${labelTags(c)}</span>${c.waiting ? `<span class="wait-text">${icon(c.waiting.kind === "confirmation" ? "clock" : "pause")}${c.waiting.kind === "confirmation" ? "等待确认" : "等待依赖"}</span>` : ""}<span class="card-foot">${c.tasks.length ? taskCell(c) : ""}<span class="grow"></span>${avatar(c.creator, "sm")}</span></a>`).join("") || `<p class="board-empty">没有 Change</p>`}</section>`;
  }).join("")}</div>`;
}
A["scope"] = (el) => {
  S.changes.scope = el.dataset.arg;
  S.changes.issues = false;
  render();
};
A["show-issues"] = () => {
  S.changes.issues = true;
  render();
};
A["hide-issues"] = () => {
  S.changes.issues = false;
  render();
};
A["filter-menu"] = (el) =>
  openPop(el, () => {
    const all = changesOf().filter((c) => c.status !== "unknown"),
      f = S.changes;
    const types = [...new Set(all.flatMap((c) => c.labels))];
    const creators = [...new Set(all.map((c) => c.creator))];
    const n = (fn) => all.filter((c) => inScope(c, f.scope) && fn(c)).length;
    const item = (group, value, label, count, lead = "") => `<button class="menu-item" role="menuitemcheckbox" aria-checked="${f[group].includes(value)}" data-action="toggle-filter" data-arg="${group}:${value}" data-key="f:${group}:${value}"><span class="check-box">${f[group].includes(value) ? icon("check") : ""}</span>${lead}<span class="grow">${esc(label)}</span><span class="count">${count}</span></button>`;
    return `<div class="menu filter-pop" role="menu" aria-label="筛选"><div class="menu-label">类型</div>${types.map((t) => item("types", t, t, n((c) => c.labels.includes(t)))).join("")}<div class="menu-sep"></div><div class="menu-label">紧急程度</div>${Object.entries(URGENCY).map(([k, l]) => item("urgency", k, l, n((c) => (c.urgency || "normal") === k))).join("")}<div class="menu-sep"></div><div class="menu-label">创建者</div>${creators.map((p) => item("creators", p, person(p).name + (p === ACCOUNT.person ? "（我）" : ""), n((c) => c.creator === p), avatar(p, "sm"))).join("")}${filterCount() ? `<div class="menu-sep"></div><button class="menu-item" role="menuitem" data-action="clear-filters" data-key="clear-in-menu">${icon("x")}<span class="grow">清除筛选</span></button>` : ""}</div>`;
  }, { label: "筛选", align: "end", cls: "wide" });
A["toggle-filter"] = (el) => {
  const [k, v] = el.dataset.arg.split(":");
  const arr = S.changes[k];
  S.changes[k] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  render();
  refreshPop();
};
A["drop-filter"] = (el) => {
  const [k, v] = el.dataset.arg.split(":");
  S.changes[k] = S.changes[k].filter((x) => x !== v);
  render();
  ($(".chip") || $('[data-key="filter-menu"]'))?.focus();
};
A["clear-filters"] = () => {
  Object.assign(S.changes, { types: [], urgency: [], creators: [] });
  closePop(false);
  render();
  $('[data-key="filter-menu"]')?.focus();
};
A["display-menu"] = (el) =>
  openPop(el, () => {
    const f = S.changes,
      active = f.scope === "active" && !f.issues;
    const radio = (key, value, label) => `<button class="menu-item" role="menuitemradio" aria-checked="${f[key] === value}" data-action="set-display" data-arg="${key}:${value}" data-key="d:${key}:${value}"><span class="check-box round">${f[key] === value ? "<i></i>" : ""}</span><span class="grow">${label}</span></button>`;
    return `<div class="menu" role="menu" aria-label="显示">${active && !mobile() ? `<div class="menu-row"><span class="grow">视图</span><span class="seg sm" role="radiogroup" aria-label="视图">${[["list", "列表", "list"], ["board", "看板", "board"]].map(([k, l, g]) => `<button role="radio" aria-checked="${f.view === k}" data-action="set-display" data-arg="view:${k}" data-key="v:${k}">${icon(g)}<span>${l}</span></button>`).join("")}</span></div><div class="menu-sep"></div>` : ""}${active && f.view === "list" ? `<div class="menu-label">分组</div>${radio("group", "status", "按处理状态")}${radio("group", "stage", "按阶段")}${radio("group", "none", "不分组")}<div class="menu-sep"></div>` : ""}<div class="menu-label">排序</div>${radio("sort", "created", "最新创建")}${radio("sort", "urgency", "紧急程度优先")}</div>`;
  }, { label: "显示", align: "end" });
A["set-display"] = (el) => {
  const [k, v] = el.dataset.arg.split(":");
  S.changes[k] = v;
  render();
  refreshPop();
};
A["open-change"] = (el) => {
  closePop(false);
  S.lastListKey = el.dataset.key;
  go(`changes/${el.dataset.arg}`);
};

// Change 详情：完整阅读页，与分享页共用材料目录与正文。
function materials(c) {
  const docs = CHANGE_DOCS[c.id];
  const at = stageIndex(c),
    drafted = (k) => {
      const n = STAGES.findIndex(([s]) => s === k);
      return c.status === "completed" || at > n || (at === n && !!c.waiting);
    };
  const has = (k) =>
    docs ? !!docs[k]
    : k === "requirement" ? true
    : k === "technical" || k === "plan" ? c.size !== "small" && drafted(k)
    : k === "execution" ? c.size === "large" && (c.status === "completed" || doneTasks(c).length > 0)
    : false;
  return [
    { id: "overview", label: "概览", glyph: "info", ok: true },
    { id: "tasks", label: "任务", glyph: "tasks", ok: true, meta: c.tasks.length ? `${doneTasks(c).length}/${c.tasks.length}` : "" },
    { group: "文档" },
    { id: "requirement", label: "需求", glyph: "file", ok: has("requirement") },
    { id: "technical", label: "技术方案", glyph: "file", ok: has("technical"), missing: S.scene === "missing" && c.id === "offline-map-regions" },
    { id: "plan", label: "计划", glyph: "file", ok: has("plan") },
    { id: "execution", label: "执行记录", glyph: "file", ok: has("execution") },
    { id: "review", label: "评审记录", glyph: "file", ok: !!docs?.review || (c.status === "completed" && c.size === "large") },
    { group: "交付" },
    { id: "prototypes", label: "原型", glyph: "layout", ok: !!c.previews?.length, meta: c.previews?.length || "" },
    { id: "integration", label: "合入变更", glyph: "diff", ok: !!c.integration || S.scene === "integration-error" },
    { id: "evidence", label: "依据", glyph: "shield", ok: true },
  ];
}
function materialPane(c, base) {
  return `<div class="pane-head"><span class="pane-title clamp">${esc(c.title)}</span>${innerWidth >= 1024 ? ibtn("收起目录", "pane-toggle", "panel", { side: "bottom" }) : ""}</div><ul class="tree mats" role="list">${materials(c)
    .map((m) => (m.group ? `<li class="tree-group">${m.group}</li>` : `<li><a class="tree-item mat ${m.ok ? "" : "absent"}" href="#/${base}/${m.id}" data-action="open-mat" data-arg="${base}/${m.id}" data-key="mat:${m.id}" ${S.path[2] === m.id || (!S.path[2] && m.id === "overview") ? 'aria-current="page"' : ""}>${icon(m.glyph)}<span class="grow">${m.label}</span>${m.missing ? `<span class="mat-meta warn">缺失</span>` : m.ok ? (m.meta ? `<span class="mat-meta">${m.meta}</span>` : "") : `<span class="mat-meta">未产生</span>`}</a></li>`))
    .join("")}</ul>`;
}
A["open-mat"] = (el) => {
  closeDialog();
  const [, , id] = el.dataset.arg.split("/");
  S.scroll[`${route()}-doc`] = 0;
  go(el.dataset.arg);
};
function changeHeader(c) {
  const i = stageIndex(c);
  const flow = c.status === "unknown" ? "" : `<ol class="flow" aria-label="阶段">${STAGES.map(([k, l], n) => {
    const state = c.status === "completed" || n < i ? "past" : n === i && c.status === "active" ? "now" : "";
    return `<li class="${state}" ${state === "now" ? 'aria-current="step"' : ""}>${state === "past" ? icon("check") : `<i></i>`}<span>${k === "close" && c.status === "active" ? "验收" : l}</span></li>`;
  }).join("")}</ol>`;
  return `<div class="doc-crumb"><code>${c.id}</code></div><h1 id="doc-top" tabindex="-1">${esc(c.title)}</h1><div class="change-facts">${avatar(c.creator, "sm")}<span>${esc(person(c.creator).name)} 创建于 ${dateLabel(c.created)}</span><span class="dot-sep"></span><span>${SIZE[c.size]}</span>${c.labels.length ? `<span class="dot-sep"></span>${labelTags(c)}` : ""}${urgencyFlag(c) ? `<span class="dot-sep"></span>${urgencyFlag(c)}` : ""}${c.status === "cancelled" ? `<span class="dot-sep"></span>${tag("已取消", "red")}` : ""}</div>${flow}`;
}
function changeDetailView(id, shared = false) {
  const c = changeById(id);
  const base = `${shared ? "share" : "changes"}/${id}`;
  if (!shared) {
    const gate = sceneGate("reader");
    if (gate) return { ...gate, left: backButton() };
  }
  if (!c)
    return { body: `<div class="page"><div class="page-inner">${empty("当前记录中没有这个 Change", "它可能已移动到其他分支，或还没有推送。", btn("返回 Changes", "go", { arg: "changes" }), "change")}</div></div>`, left: backButton() };
  if (c.status === "unknown")
    return { body: `<div class="page"><div class="page-inner">${empty("这个 Change 的记录无法完整读取", `${esc(c.issue)}。修正并推送 change.json 后会恢复显示。`, btn("返回 Changes", "go", { arg: "changes" }), "warning")}</div></div>`, left: backButton() };
  const mat = S.path[2] || "overview",
    m = materials(c).find((x) => x.id === mat) || materials(c)[0];
  const { html, toc, wide } = materialBody(c, m, shared);
  currentToc = () => toc;
  currentPane = () => materialPane(c, base);
  currentPaneLabel = "材料";
  const article = `${S.scene === "offline" || S.scene === "sync-failed" ? (shared ? syncFailedBanner() : offlineBanner()) : ""}${m.id === "overview" ? changeHeader(c) : `<div class="doc-crumb"><a href="#/${base}" data-action="open-mat" data-arg="${base}/overview" data-key="crumb-overview">${esc(c.title)}</a>${icon("right")}<span>${m.label}</span></div><h1 id="doc-top" tabindex="-1">${m.label}</h1>`}${html}`;
  const list = changesOf().filter((x) => x.status === c.status),
    idx = list.findIndex((x) => x.id === c.id);
  return {
    body: reader({ key: shared ? "share" : "change", pane: materialPane(c, base), paneLabel: "Change 材料", article, toc, wide }),
    left: shared ? "" : `${backButton()}<span class="tb-title clamp">${esc(c.title)}</span>`,
    right: shared ? "" : `${readerTools(toc, "材料")}${mobile() ? "" : `${ibtn("上一个 Change", "step-change", "up", { arg: list[idx - 1]?.id || "", disabled: idx <= 0 })}${ibtn("下一个 Change", "step-change", "down", { arg: list[idx + 1]?.id || "", disabled: idx < 0 || idx >= list.length - 1 })}`}${mobile() ? ibtn("分享", "share-menu", "share", { popup: "dialog", arg: c.id, key: "share-menu" }) : btn("分享", "share-menu", { icon: "share", kind: "ghost", popup: "dialog", arg: c.id, key: "share-menu" })}${ibtn("更多操作", "change-more", "more", { popup: "menu", arg: c.id })}`,
    hideRepo: mobile(),
    noSync: mobile(),
    noAccount: true,
  };
}
const backButton = () => `<a class="back" href="#/changes" data-action="back-to-list" data-key="back-to-list">${icon("arrowLeft")}<span>Changes</span></a>`;
A["back-to-list"] = () => {
  S.focusAfter = S.lastListKey;
  go("changes");
};
A["step-change"] = (el) => el.dataset.arg && go(`changes/${el.dataset.arg}/${S.path[2] || "overview"}`);
const shareUrl = (c) => `https://folio.example.com/share/github.com/${repo().owner}/${repo().repo}/changes/${c.id}`;
A["share-menu"] = (el) =>
  openPop(el, () => {
    const c = changeById(el.dataset.arg);
    return `<div class="pop-pad share-pop"><div class="pop-title">分享这个 Change</div><p class="pop-text">拿到链接的人无需登录即可阅读全部详情：需求、方案、任务、原型与合入差异，内容随最新推送更新。</p><div class="copy-row"><input class="input sm mono-text" readonly value="${esc(shareUrl(c))}" aria-label="分享链接" data-key="share-url">${btn("复制", "copy-share", { kind: "sm primary", arg: c.id })}</div><div class="pop-actions">${btn("打开分享页", "open-share", { kind: "sm", arg: c.id, icon: "arrowUpRight" })}</div><p class="pop-foot">${icon("lock")}链接不包含你的账号或 Token，只能读取这个 Change。</p></div>`;
  }, { align: "end", label: "分享这个 Change", cls: "share" });
A["copy-share"] = (el) => {
  closePop();
  copyText(shareUrl(changeById(el.dataset.arg)), "分享链接");
};
A["open-share"] = (el) => go(`share/${el.dataset.arg}`);
A["change-more"] = (el) =>
  openPop(el, () => `<div class="menu" role="menu" aria-label="更多操作"><button class="menu-item" role="menuitem" data-action="copy-work-link" data-arg="${el.dataset.arg}" data-key="copy-work-link">${icon("link")}<span class="grow">复制工作台链接</span></button><div class="menu-note">工作台链接只记录阅读位置，打开者需要用自己的 Token 读取。</div></div>`, { align: "end", label: "更多操作", cls: "wide" });
A["copy-work-link"] = (el) => {
  closePop();
  copyText(`https://folio.example.com/#/r/github.com/${repo().owner}/${repo().repo}/changes/${el.dataset.arg}`, "工作台链接");
};
function section(id, title, body) {
  return `<h2 id="${id}">${title}</h2>${body}`;
}
function materialBody(c, m, shared) {
  const docs = CHANGE_DOCS[c.id] || {};
  if (m.id === "overview") return overviewBody(c, shared);
  if (m.id === "review" && !m.ok) return { html: `<p class="muted">还没有评审记录。large Change 会在关闭前完成独立评审。</p>`, toc: [] };
  if (m.id === "tasks") {
    const groups = c.tasks;
    if (!groups.length) return { html: `<p class="muted">${c.stage === "requirement" || c.stage === "technical" || c.stage === "plan" ? "计划确认后会在这里列出任务。" : "没有实现任务。"}</p>`, toc: [] };
    const label = { done: "完成", doing: "进行中", todo: "未开始", blocked: "受阻" };
    return {
      html: `<p class="sub">${groups.length} 个任务 · ${doneTasks(c).length} 个完成${blockedTasks(c).length ? ` · ${blockedTasks(c).length} 个受阻` : ""}</p><ol class="task-list" role="list">${groups.map((t) => `<li class="task ${t.status}"><span class="task-icon" title="${label[t.status]}">${icon(t.status)}</span><div class="stack grow"><span class="task-title"><span class="task-id">${t.id}</span>${esc(t.title)}</span><small>${label[t.status]}${t.verification ? ` · ${esc(t.verification)}` : ""}${t.reason ? ` · ${esc(t.reason)}` : ""}</small></div></li>`).join("")}</ol>`,
      toc: [],
    };
  }
  if (["requirement", "technical", "plan", "execution", "review"].includes(m.id)) {
    if (m.missing) return { html: `<div class="callout warn">${icon("warning")}<p><strong>文件缺失</strong><br>change.json 记录了技术确认，但分支上找不到 technical.md。请检查最近的提交是否遗漏了这个文件。</p></div>`, toc: [] };
    if (!m.ok) return { html: `<p class="muted">还没有${m.label}。${m.id === "review" ? "large Change 会在关闭前完成独立评审。" : "进入对应阶段后由 SpecTrail 生成。"}</p>`, toc: [] };
    const file = { requirement: "requirement.md", technical: "technical.md", plan: "plan.md", execution: "execution.md", review: "review.md" }[m.id];
    const secs = docs[m.id] || [{ id: "summary", h: "概要", html: `<p>${esc(c.title)}的${m.label}。示例中仅提供摘要，完整内容在真实工作台中按 Markdown 呈现。</p>` }];
    return { html: `<div class="doc-meta"><span class="mono-text">${file}</span><span class="dot-sep"></span><span>${c.branch}</span></div>${secs.map((s) => section(s.id, esc(s.h), s.html)).join("")}`, toc: secs.map(({ id, h }) => ({ id, h })) };
  }
  if (m.id === "prototypes") {
    const items = (c.previews || []).map(protoById).filter(Boolean);
    if (!items.length) return { html: `<p class="muted">这个 Change 没有登记原型。</p>`, toc: [] };
    if (shared) return { html: items.map((p) => `<h2 id="p-${p.id}">${esc(p.title)}</h2><p class="muted">${esc(p.desc)} 固定版本 ${p.version}</p>${inlineCanvas(p)}`).join(""), toc: items.map((p) => ({ id: `p-${p.id}`, h: p.title })) };
    return { html: `<div class="proto-grid compact">${items.map((p) => protoCard(p)).join("")}</div>`, toc: [] };
  }
  if (m.id === "integration") return integrationBody(c);
  return evidenceBody(c);
}
function overviewBody(c, shared) {
  const toc = [];
  let html = "";
  if (c.waiting) html += `<div class="callout warn">${icon(c.waiting.kind === "confirmation" ? "clock" : "pause")}<p><strong>${c.waiting.kind === "confirmation" ? "等待确认" : c.waiting.kind === "dependency" ? "等待依赖" : "暂停"}</strong> · ${esc(c.waiting.since)}<br>${esc(c.waiting.summary)}</p></div>`;
  if (blockedTasks(c).length) html += `<div class="callout bad">${icon("blocked")}<p><strong>${blockedTasks(c)[0].id} 受阻</strong><br>${esc(blockedTasks(c)[0].reason)}</p></div>`;
  if (c.status === "cancelled") html += `<div class="callout">${icon("info")}<p><strong>已于 ${c.cancelled} 取消</strong><br>${esc(c.cancelReason)}</p></div>`;
  if (c.tasks.length) {
    toc.push({ id: "progress", h: "进度" });
    const doing = c.tasks.find((t) => t.status === "doing"),
      p = doneTasks(c).length / c.tasks.length;
    html += section("progress", "进度", `<div class="progress-card"><div class="progress-top"><strong>${doneTasks(c).length} / ${c.tasks.length}</strong><span class="muted">个任务完成</span></div><div class="meter wide" role="progressbar" aria-valuenow="${Math.round(p * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="任务完成度"><i style="width:${p * 100}%"></i></div>${doing ? `<p class="progress-next">${icon("doing")}进行中：${doing.id} ${esc(doing.title)}</p>` : ""}</div>`);
  }
  if (c.delivery) {
    toc.push({ id: "delivery", h: "交付" });
    const pr = (p) => `<li><a class="pr-row" href="#" data-action="open-pr" data-arg="${p.n}" data-key="pr:${p.n}">${icon("merge")}<span class="grow stack"><span>#${p.n} ${esc(p.title)}</span><small><code>${esc(p.head)}</code> → <code>${esc(p.base)}</code>${p.version ? ` · 版本 ${p.version}` : ""}</small></span>${tag(p.state === "merged" ? "已合入" : p.draft ? "草稿" : p.state === "closed" ? "已关闭" : "待合入", p.state === "merged" ? "green" : "")}${icon("arrowUpRight", "faint")}</a></li>`;
    const d = c.delivery;
    html += section("delivery", "交付", `<div class="delivery">${d.stage ? `<p>${deliveryTag(c, false)}<span class="muted"> ${d.stage === "pendingRelease" ? "已合入集成分支，尚未发起发布 PR。" : d.stage === "pendingIntegration" ? "已具备交付条件，Change PR 尚未合入。" : d.stage === "releaseMerged" ? "发布 PR 已合入发布分支；是否已部署以发布记录为准。" : ""}</span></p>` : `<p class="muted">执行中，PR 仍是草稿；进入关闭阶段后显示交付状态。</p>`}<div class="pr-group"><div class="pr-label">Change PR</div><ul class="pr-list" role="list">${d.changePrs.map(pr).join("") || `<li class="muted">暂无关联 PR</li>`}</ul></div>${c.status === "completed" ? `<div class="pr-group"><div class="pr-label">发布 PR</div><ul class="pr-list" role="list">${d.releasePrs.map(pr).join("") || `<li class="muted">尚未发起</li>`}</ul></div>` : ""}</div>`);
  }
  const rel = [];
  if (c.related.length) rel.push(`<div class="rel"><span class="rel-label">关联能力</span><span class="rel-items">${c.related.map((p) => { const n = specNodes().find((x) => x.path === p); return shared ? `<span class="rel-chip">${icon("book")}${esc(n?.title || p)}</span>` : `<a class="rel-chip" href="#/specs/${p}" data-action="open-spec" data-arg="${p}" data-key="relspec:${p}">${icon("book")}${esc(n?.title || p)}</a>`; }).join("")}</span></div>`);
  const deps = (c.dependsOn || []).map(changeById).filter(Boolean),
    dependents = changesOf().filter((x) => x.dependsOn?.includes(c.id));
  const link = (x) => (shared ? `<span class="rel-chip">${stageDots(x)}${esc(x.title)}</span>` : `<a class="rel-chip" href="#/changes/${x.id}" data-action="open-change" data-arg="${x.id}" data-key="rel:${x.id}">${stageDots(x)}${esc(x.title)}</a>`);
  if (deps.length) rel.push(`<div class="rel"><span class="rel-label">依赖</span><span class="rel-items">${deps.map(link).join("")}</span></div>`);
  if (dependents.length) rel.push(`<div class="rel"><span class="rel-label">被依赖</span><span class="rel-items">${dependents.map(link).join("")}</span></div>`);
  const prev = c.followUpOf && changeById(c.followUpOf),
    next = changesOf().filter((x) => x.followUpOf === c.id);
  if (prev) rel.push(`<div class="rel"><span class="rel-label">延续自</span><span class="rel-items">${link(prev)}</span></div>`);
  if (next.length) rel.push(`<div class="rel"><span class="rel-label">后续</span><span class="rel-items">${next.map(link).join("")}</span></div>`);
  if (rel.length) {
    toc.push({ id: "relations", h: "关联" });
    html += section("relations", "关联", `<div class="rels">${rel.join("")}</div>`);
  }
  if (c.clarifications?.length) {
    toc.push({ id: "qa", h: "澄清问答" });
    html += section("qa", "澄清问答", `<ol class="qa" role="list">${c.clarifications.map((q) => `<li class="qa-item ${q.withdrawn ? "withdrawn" : !q.answer ? "open" : ""}"><div class="qa-head"><span class="qa-id">${q.q}</span><span class="muted">第 ${q.round} 轮</span>${q.withdrawn ? tag("已撤回") : !q.answer ? tag("未回答", "amber") : ""}</div><p class="qa-q">${esc(q.text)}</p><p class="qa-rec">推荐：${esc(q.rec)}</p>${q.answer ? `<p class="qa-a">${icon("check")}${esc(q.answer)}</p>` : ""}${q.withdrawn ? `<p class="qa-w">撤回原因：${esc(q.withdrawn)}</p>` : ""}</li>`).join("")}</ol>`);
  }
  if (!html) html = `<p class="muted">还没有进度、交付或问答记录。</p>`;
  return { html, toc };
}
A["open-pr"] = () => toast("示例 PR：真实工作台会在新标签页打开 GitHub");
function integrationBody(c) {
  if (S.scene === "integration-error") return { html: `<div class="callout bad">${icon("alert")}<p><strong>合入记录无法核对</strong><br>集成分支上找到 2 个带有 SpecTrail-Change: ${c.id} 的合并提交，无法确定哪一个是本次交付。请在仓库中修正后重新读取。</p></div>`, toc: [] };
  if (!c.integration) return { html: `<p class="muted">${c.status === "completed" ? "这个 Change 没有可核对的合入记录。" : "尚未合入。Change 归档并合入集成分支后，这里显示合入的文件与差异。"}</p>`, toc: [] };
  const I = INTEGRATION,
    file = S.diffFile && I.diff[S.diffFile] ? S.diffFile : Object.keys(I.diff)[0];
  const lines = I.diff[file];
  return {
    wide: true,
    toc: [],
    html: `<div class="commit-line">${icon("commit")}<code>${I.commit}</code><span class="grow clamp">${esc(I.title)}</span><span class="muted">${I.at}</span></div><div class="diff-wrap"><ul class="file-list" role="list" aria-label="变更文件">${I.files.map((f) => `<li><button class="file-item ${f.path === file ? "on" : ""}" ${attr({ "data-action": I.diff[f.path] ? "pick-file" : "noop", "data-arg": f.path, "data-key": `file:${f.path}`, "aria-current": f.path === file ? "true" : undefined, "aria-disabled": I.diff[f.path] ? undefined : "true" })}><span class="file-path">${esc(f.path)}</span><span class="file-stat">${f.kind === "binary" ? tag("二进制") : f.kind === "moved" ? tag("归档移动") : `<span class="add">+${f.add}</span><span class="del">−${f.del}</span>`}</span></button></li>`).join("")}</ul><div class="diff" role="region" aria-label="${esc(file)} 的差异" tabindex="0"><div class="diff-file">${esc(file)}</div><table><tbody>${lines.map(([k, a, b, t]) => (k === "hunk" ? `<tr class="hunk"><td colspan="3">${esc(a)}</td></tr>` : `<tr class="${k}"><td class="ln">${a ?? ""}</td><td class="ln">${b ?? ""}</td><td class="code"><span class="sign">${k === "add" ? "+" : k === "del" ? "−" : " "}</span>${esc(t)}</td></tr>`)).join("")}</tbody></table></div></div>`,
  };
}
A["pick-file"] = (el) => {
  S.diffFile = el.dataset.arg;
  render();
  $(".diff")?.focus({ preventScroll: true });
};
function evidenceBody(c) {
  const conf = c.confirmations || (c.stage !== "requirement" ? [{ phase: "需求", at: dateLabel(c.created), summary: "目标、范围与验收已确认" }] : []);
  const closing = c.status === "completed" ? [["整体验证", "通过", "独立评审与回归测试通过"], ["验收", "用户验收", `${c.archived} 确认交付`], ["Specs", "已同步", c.related.join("、") || "无需变更"], ["归档", "完成", `docs/project/archive/2026-${c.id}`]] : [];
  return {
    toc: [{ id: "confirm", h: "阶段确认" }, ...(closing.length ? [{ id: "closing", h: "关闭记录" }] : []), { id: "source", h: "读取来源" }],
    html: section("confirm", "阶段确认", conf.length ? `<ul class="ev-list" role="list">${conf.map((x) => `<li><span class="ev-k">${x.phase}</span><span class="grow">${esc(x.summary)}</span><span class="muted">${x.at}</span></li>`).join("")}</ul>` : `<p class="muted">尚无阶段确认。</p>`) +
      (closing.length ? section("closing", "关闭记录", `<ul class="ev-list" role="list">${closing.map(([k, r, s]) => `<li><span class="ev-k">${k}</span><span class="grow">${esc(s)}</span>${tag(r, "green")}</li>`).join("")}</ul>`) : "") +
      section("source", "读取来源", `<dl class="kv wide"><dt>集中入口</dt><dd><code>develop:docs/project/changes/${c.id}/change.json</code></dd><dt>工作分支</dt><dd><code>${esc(c.branch)}</code></dd><dt>读取提交</dt><dd><code>9de1e5a</code> · 10:24</dd></dl>`),
  };
}
