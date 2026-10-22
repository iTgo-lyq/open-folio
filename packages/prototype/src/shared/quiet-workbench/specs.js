// 阅读布局：左侧目录 + 正文 + 本页目录。Specs、Change 详情与分享页共用。
function reader({ key, pane, paneLabel, article, toc = [], wide = false }) {
  const hidePane = !S.reading.pane || S.reading.focus;
  return `<div class="reader ${hidePane ? "no-pane" : ""} ${toc.length && !wide && !S.reading.focus ? "" : "no-toc"} ${wide ? "wide" : ""} size-${S.reading.size}">
    <nav class="pane" aria-label="${esc(paneLabel)}" data-scroll="${key}-pane">${pane}</nav>
    <div class="doc-scroll" data-scroll="${key}-doc"><article class="doc prose">${article}</article></div>
    ${toc.length && !wide ? `<nav class="toc" aria-label="本页目录"><div class="toc-label">本页目录</div>${tocLinks(toc)}</nav>` : ""}
  </div>`;
}
const tocLinks = (toc) => toc.map((t) => `<a href="#" class="toc-link" data-action="toc" data-arg="${t.id}" data-key="toc:${t.id}">${esc(t.h)}</a>`).join("");
const readerTools = (toc, paneLabel) => {
  const narrow = innerWidth < 1024,
    paneHidden = !S.reading.pane || S.reading.focus;
  return `${narrow ? ibtn(paneLabel, "pane-sheet", "panel", { popup: "dialog" }) : paneHidden ? ibtn(`显示${paneLabel}`, "pane-toggle", "panel") : ""}${((innerWidth < 1280 && !narrow) || S.reading.focus) && toc.length ? ibtn("本页目录", "toc-menu", "toc", { popup: "dialog" }) : ""}${ibtn("阅读设置", "reading-menu", "text", { popup: "dialog" })}`;
};
function updateToc() {
  const scroller = $(".doc-scroll");
  if (!scroller) return;
  // 顶栏浮在滚动区上方，以顶栏下沿（滚动区的上内边距）为阅读起点。
  const heads = $$(".doc h2[id]", scroller),
    top = scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(scroller).paddingTop);
  let active = heads[0]?.id;
  for (const h of heads) if (h.getBoundingClientRect().top - top <= 48) active = h.id;
  if (heads.length && scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) active = heads.at(-1).id;
  $$(".toc-link").forEach((a) => (a.dataset.arg === active ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
}
A["toc"] = (el) => {
  closePop(false);
  closeDialog();
  const target = document.getElementById(el.dataset.arg),
    scroller = $(".doc-scroll");
  if (!target || !scroller) return;
  const inset = parseFloat(getComputedStyle(scroller).paddingTop);
  scroller.scrollTo({ top: scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset - 24, behavior: S.motion === "reduce" ? "auto" : "smooth" });
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
};
A["toc-menu"] = (el) => openPop(el, () => `<nav class="menu toc-pop" aria-label="本页目录"><div class="menu-label">本页目录</div>${tocLinks(currentToc()).replaceAll('class="toc-link"', 'class="menu-item toc-link"')}</nav>`, { align: "end", label: "本页目录" });
A["reading-menu"] = (el) =>
  openPop(el, () => `<div class="pop-pad"><div class="pop-title">阅读设置</div><div class="menu-row"><span class="grow">字号</span><span class="seg sm" role="radiogroup" aria-label="字号">${[["normal", "标准"], ["large", "较大"]].map(([k, l]) => `<button role="radio" aria-checked="${S.reading.size === k}" data-action="reading-size" data-arg="${k}" data-key="size:${k}">${l}</button>`).join("")}</span></div>${innerWidth >= 1024 ? `<div class="menu-row"><span class="grow">专注阅读</span><button class="switch" role="switch" aria-checked="${S.reading.focus}" data-action="reading-focus" data-key="focus" aria-label="专注阅读"><i></i></button></div><p class="menu-note">专注阅读收起目录，只保留正文。</p>` : ""}</div>`, { align: "end", label: "阅读设置" });
A["reading-size"] = (el) => {
  S.reading.size = el.dataset.arg;
  render();
  refreshPop();
};
A["reading-focus"] = () => {
  S.reading.focus = !S.reading.focus;
  render();
  refreshPop();
};
A["pane-toggle"] = () => {
  S.reading.pane = !S.reading.pane;
  S.reading.focus = false;
  render();
};
let currentToc = () => [];
let currentPane = () => "";
A["pane-sheet"] = () => openDialog(`<div class="sheet-head"><span class="grow sheet-title">${esc(currentPaneLabel)}</span>${ibtn("关闭", "close-dialog", "x", { tip: false })}</div><nav class="sheet-body pane-in-sheet" aria-label="${esc(currentPaneLabel)}">${currentPane()}${currentToc().length ? `<div class="tree-group">本页目录</div>${tocLinks(currentToc()).replaceAll('class="toc-link"', 'class="tree-item toc-link"')}` : ""}</nav>`, { cls: "sheet left", label: currentPaneLabel });
let currentPaneLabel = "目录";

// ② Specs
const DEFAULT_SPEC = { atlas: "maps/offline", folio: "writing" };
S.lastSpec = {};
function specsPath() {
  const p = S.lastSpec[S.repo] || DEFAULT_SPEC[S.repo];
  return p ? `specs/${p}` : "specs";
}
const specNodes = (tree = SPEC_TREE[S.repo] || []) => tree.flatMap((n) => [n, ...(n.children || [])]);
function specTree(active) {
  const item = (n, depth) => {
    const open = S.specOpen[n.path] ?? true,
      kids = n.children?.length;
    const toggle = kids ? `<button class="tree-toggle" type="button" data-action="spec-ns" data-arg="${n.path}" data-key="ns:${n.path}" aria-expanded="${open}" aria-label="${open ? "收起" : "展开"}${esc(n.title)}">${icon(open ? "down" : "right")}</button>` : `<span class="tree-toggle-space"></span>`;
    const label = n.doc ? `<a class="tree-item" href="#/specs/${n.path}" data-action="open-spec" data-arg="${n.path}" data-key="spec:${n.path}" ${n.path === active ? 'aria-current="page"' : ""}>${esc(n.title)}</a>` : `<button class="tree-item ns" type="button" data-action="spec-ns" data-arg="${n.path}" data-key="ns-label:${n.path}" aria-expanded="${open}">${esc(n.title)}</button>`;
    return `<li class="tree-row" style="--d:${depth}">${toggle}${label}</li>${kids && open ? n.children.map((c) => item(c, depth + 1)).join("") : ""}`;
  };
  return `<div class="pane-head"><span>Specs</span>${innerWidth >= 1024 ? ibtn("收起目录", "pane-toggle", "panel", { side: "bottom" }) : ""}</div><ul class="tree" role="list">${(SPEC_TREE[S.repo] || []).map((n) => item(n, 0)).join("")}</ul>`;
}
A["spec-ns"] = (el) => {
  const p = el.dataset.arg;
  S.specOpen[p] = !(S.specOpen[p] ?? true);
  if ($("#dlg").open) updateDialog(`<div class="sheet-head"><span class="grow sheet-title">Specs</span>${ibtn("关闭", "close-dialog", "x", { tip: false })}</div><nav class="sheet-body pane-in-sheet" aria-label="Specs">${currentPane()}</nav>`);
  else render();
};
A["open-spec"] = (el) => {
  closeDialog();
  S.lastSpec[S.repo] = el.dataset.arg;
  S.scroll["specs-doc"] = 0;
  go(`specs/${el.dataset.arg}`);
};
function specsView() {
  const gate = sceneGate("reader");
  if (gate) return gate;
  const nodes = specNodes();
  if (S.scene === "empty" || !nodes.length)
    return { body: `<div class="page"><div class="page-inner">${empty("这个仓库还没有 Specs", "Specs 记录已经实现的能力。第一个 Change 完成并同步 Specs 后，会出现在这里。", btn("查看 Changes", "go", { arg: "changes" }), "book")}</div></div>` };
  const path = S.path.slice(1).join("/") || DEFAULT_SPEC[S.repo],
    node = nodes.find((n) => n.path === path && n.doc) || nodes.find((n) => n.doc);
  S.lastSpec[S.repo] = node.path;
  const doc = SPEC_DOCS[node.path] || genericSpec(node.title, node.path),
    parent = specNodes().find((n) => n.children?.some((c) => c.path === node.path));
  const related = changesOf().filter((c) => c.related.includes(node.path) && c.status !== "unknown");
  const toc = [...doc.sections.map(({ id, h }) => ({ id, h })), ...(related.length ? [{ id: "related", h: "相关 Change" }] : [])];
  currentToc = () => toc;
  currentPane = () => specTree(node.path);
  currentPaneLabel = "Specs";
  const article = `${S.scene === "offline" ? offlineBanner() : ""}<div class="doc-crumb">${parent ? `<span>${esc(parent.title)}</span>${icon("right")}` : ""}<span>${esc(node.title)}</span></div><h1 id="doc-top" tabindex="-1">${esc(node.title)}</h1><p class="lead">${doc.lead}</p><div class="doc-meta"><span>更新于 ${doc.updated}</span><span class="dot-sep"></span><code>${doc.commit}</code><span class="grow"></span>${ibtn("更多操作", "spec-more", "more", { popup: "menu", key: "spec-more" })}</div>${doc.sections.map((s) => `<h2 id="${s.id}">${esc(s.h)}</h2>${withIcons(s.html)}`).join("")}${related.length ? `<h2 id="related">相关 Change</h2><ul class="mini-list" role="list">${related.map((c) => `<li><a class="mini-row" href="#/changes/${c.id}" data-action="open-change" data-arg="${c.id}" data-key="rel:${c.id}">${stageDots(c)}<span class="grow stack"><span>${esc(c.title)}</span><small>${statusText(c)}</small></span>${avatar(c.creator, "sm")}</a></li>`).join("")}</ul>` : ""}`;
  return {
    body: reader({ key: "specs", pane: specTree(node.path), paneLabel: "Specs", article, toc }),
    right: readerTools(toc, "Specs 目录"),
  };
}
A["spec-more"] = (el) =>
  openPop(el, () => `<div class="menu" role="menu" aria-label="更多操作"><button class="menu-item" role="menuitem" data-action="copy-read-link" data-key="copy-read-link">${icon("link")}<span class="grow">复制阅读链接</span></button><button class="menu-item" role="menuitem" data-action="view-raw" data-key="view-raw">${icon("file")}<span class="grow">查看原文</span></button></div>`, { align: "end", label: "更多操作" });
A["copy-read-link"] = () => {
  closePop();
  copyText(`https://folio.example.com/#/r/github.com/${repo().owner}/${repo().repo}/specs/${S.lastSpec[S.repo]}`, "阅读链接");
};
A["view-raw"] = () => {
  const path = S.lastSpec[S.repo],
    node = specNodes().find((n) => n.path === path),
    doc = SPEC_DOCS[path] || genericSpec(node.title, path);
  const md = `# ${node.title}\n\n${doc.lead}\n\n${doc.sections.map((s) => `## ${s.h}\n\n${s.html.replace(/<li>/g, "- ").replace(/<\/(p|li|tr|pre)>/g, "\n").replace(/<[^>]+>/g, "").replace(/\{\{ICON:\w+\}\}/g, "")}`).join("\n")}`;
  openDialog(`<div class="sheet-head"><span class="grow stack"><span class="sheet-title">${esc(node.title)}</span><small class="muted mono-text">docs/project/specs/${esc(path)}/spec.md</small></span>${ibtn("关闭", "close-dialog", "x", { tip: false })}</div><pre class="raw" tabindex="0">${esc(md)}</pre>`, { cls: "sheet raw-sheet", label: "原文" });
};
