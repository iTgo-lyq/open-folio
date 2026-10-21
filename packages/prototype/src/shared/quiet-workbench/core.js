// 运行时：状态、hash 路由、渲染、弹层、对话框、提示与键盘。
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const attr = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(" ");
const clone = (v) => JSON.parse(JSON.stringify(v));
const brand = "{{data:../../assets/mark.png}}";
const withIcons = (html) => html.replace(/\{\{ICON:(\w+)\}\}/g, (_, n) => icon(n));

const S = {
  theme: "light",
  transparency: "normal",
  motion: "normal",
  scene: "normal",
  collapsed: null,
  path: [],
  query: {},
  signedIn: true,
  tokens: clone(TOKENS),
  token: "t1",
  devices: clone(DEVICES),
  repo: "atlas",
  moreRepos: false,
  changes: { scope: "active", types: [], urgency: [], creators: [], view: "list", group: "status", sort: "created", issues: false },
  protoDevice: "pc-web",
  viewer: { device: "pc-web", landscape: false, zoom: "fit", key: 0 },
  reading: { size: "normal", pane: true, focus: false },
  specOpen: { trips: true, maps: true, expenses: false },
  publicReady: { "offline-maps": true },
  scroll: {},
  lastListKey: null,
};
const person = (id) => PEOPLE[id] || { name: id, login: id, hue: 210 };
const repo = (id = S.repo) => [...REPOS, ...MORE_REPOS].find((r) => r.id === id) || REPOS[0];
const changesOf = (id = S.repo) => CHANGES[id] || [];
const changeById = (id) => Object.values(CHANGES).flat().find((c) => c.id === id);
const prototypesOf = (id = S.repo) => PROTOTYPES[id] || [];
const protoById = (id) => Object.values(PROTOTYPES).flat().find((p) => p.id === id);
const currentToken = () => S.tokens.find((t) => t.id === S.token);
const mobile = () => innerWidth <= 760;
const tablet = () => innerWidth > 760 && innerWidth <= 1100;
const collapsed = () => (S.collapsed === null ? tablet() : S.collapsed);
const dateLabel = (iso) => {
  const day = (s) => Date.UTC(...s.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  const days = Math.round((day(TODAY) - day(iso)) / 864e5),
    [, m, d] = iso.split("-").map(Number);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return `${m} 月 ${d} 日`;
};
const avatar = (id, size = "") => {
  const p = person(id);
  return `<span class="av ${size}" style="--h:${p.hue}" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>`;
};
const mono = (r, size = "") => `<span class="mono-mark ${size}" style="--h:${r.hue}" aria-hidden="true">${esc(r.name.slice(0, 1))}</span>`;
const btn = (label, action, opts = {}) =>
  `<button class="btn ${opts.kind || ""}" ${attr({ "data-action": action, "data-arg": opts.arg, "data-key": opts.key || `${action}:${opts.arg ?? ""}`, disabled: opts.disabled, "aria-haspopup": opts.popup, "aria-expanded": opts.popup ? "false" : undefined, type: "button" })}>${opts.icon ? icon(opts.icon) : ""}${label ? `<span>${label}</span>` : ""}${opts.badge ? `<span class="badge-count">${opts.badge}</span>` : ""}${opts.trail ? icon(opts.trail, "trail") : ""}</button>`;
const ibtn = (label, action, glyph, opts = {}) =>
  `<button class="ibtn ${opts.cls || ""}" ${attr({ "data-action": action, "data-arg": opts.arg, "aria-label": label, "data-tip": opts.tip === false ? undefined : label, "data-tip-side": opts.side, "data-key": opts.key || `${action}:${opts.arg ?? ""}`, "aria-pressed": opts.pressed, "aria-haspopup": opts.popup, "aria-expanded": opts.popup ? "false" : undefined, disabled: opts.disabled, type: "button" })}>${icon(glyph)}</button>`;
const tag = (text, tone = "") => `<span class="tag ${tone}">${esc(text)}</span>`;
const empty = (title, body, actions = "", glyph = "inbox") =>
  `<div class="empty" role="status">${icon(glyph, "empty-icon")}<h2>${esc(title)}</h2><p>${body}</p>${actions ? `<div class="empty-actions">${actions}</div>` : ""}</div>`;

// hash 路由：#/changes/offline-map-regions/requirement?theme=dark&scene=loading
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || document.body.dataset.start;
  const [path, qs] = raw.split("?");
  S.path = path.split("/").filter(Boolean).map(decodeURIComponent);
  S.query = Object.fromEntries(new URLSearchParams(qs || ""));
  if (S.query.theme === "dark" || S.query.theme === "light") S.theme = S.query.theme;
  if (S.query.scene) S.scene = S.query.scene;
  if (S.query.side === "collapsed") S.collapsed = true;
  if (S.query.side === "expanded") S.collapsed = false;
}
function hashFor(path) {
  const q = new URLSearchParams();
  if (S.theme === "dark") q.set("theme", "dark");
  if (S.scene !== "normal") q.set("scene", S.scene);
  const qs = q.toString();
  return `#/${path}${qs ? "?" + qs : ""}`;
}
function go(path, { replace = false } = {}) {
  closePop();
  const target = hashFor(path);
  if (location.hash === target) return render();
  if (replace) history.replaceState(null, "", target);
  else location.hash = target;
  if (replace) render();
}
const route = () => S.path[0] || "home";

// 渲染：整体替换，按 data-key 恢复焦点、按 data-scroll 恢复滚动。
let frame = 0;
function render() {
  cancelAnimationFrame(frame);
  const active = document.activeElement?.closest?.("[data-key]")?.dataset.key;
  $$("[data-scroll]").forEach((el) => (S.scroll[el.dataset.scroll] = el.scrollTop));
  const root = document.documentElement;
  root.dataset.theme = S.theme;
  root.dataset.transparency = S.transparency;
  root.dataset.motion = S.motion;
  $("#review").innerHTML = reviewBar();
  $("#app").innerHTML = view();
  $$("[data-scroll]").forEach((el) => {
    el.scrollTop = S.scroll[el.dataset.scroll] || 0;
    syncScrolled(el);
  });
  const restoring = S.focusAfter,
    want = restoring || active;
  S.focusAfter = null;
  if (want) $(`[data-key="${CSS.escape(want)}"]`)?.focus({ preventScroll: !restoring });
  if (S.pop) positionPop();
  frame = requestAnimationFrame(afterRender);
}
function afterRender() {
  updateToc();
  fitCanvas();
  $$(".thumb-stage").forEach(fitThumb);
}
function syncScrolled(el) {
  el.closest(".surface, .public-shell")?.classList.toggle("scrolled", el.scrollTop > 4);
}

// 弹层：锚定在触发按钮旁，Escape 或点击外部关闭，关闭后焦点回到触发按钮。
S.pop = null;
function openPop(anchor, content, opts = {}) {
  const key = anchor.dataset.key;
  if (S.pop?.key === key) return closePop();
  closePop(false);
  S.pop = { key, content, align: opts.align || "start", side: opts.side || "bottom", cls: opts.cls || "", label: opts.label || "" };
  anchor.setAttribute("aria-expanded", "true");
  const layer = $("#layer");
  layer.innerHTML = `<div class="pop ${S.pop.cls}" role="dialog" aria-label="${esc(S.pop.label)}" tabindex="-1">${content()}</div>`;
  positionPop();
  const first = $(".pop [data-autofocus], .pop button:not([disabled]), .pop input, .pop a[href]", layer);
  (first || $(".pop", layer)).focus({ preventScroll: true });
}
function refreshPop() {
  if (!S.pop) return;
  const focusKey = document.activeElement?.closest?.(".pop [data-key]")?.dataset.key;
  $(".pop", $("#layer")).innerHTML = S.pop.content();
  if (focusKey) $(`.pop [data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  positionPop();
}
function positionPop() {
  const pop = $(".pop", $("#layer")),
    anchor = S.pop && $(`#app [data-key="${CSS.escape(S.pop.key)}"], #review [data-key="${CSS.escape(S.pop.key)}"]`);
  if (!pop) return;
  if (!anchor) return closePop(false);
  anchor.setAttribute("aria-expanded", "true");
  const a = anchor.getBoundingClientRect(),
    w = pop.offsetWidth,
    h = pop.offsetHeight,
    gap = 6;
  let x, y;
  if (S.pop.side === "right") {
    x = a.right + gap;
    y = Math.min(a.top, innerHeight - h - 8);
  } else if (S.pop.side === "top") {
    x = S.pop.align === "end" ? a.right - w : a.left;
    y = a.top - h - gap;
  } else {
    x = S.pop.align === "end" ? a.right - w : a.left;
    y = a.bottom + gap;
    if (y + h > innerHeight - 8 && a.top - h - gap > 8) y = a.top - h - gap;
  }
  pop.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
  pop.style.top = Math.max(8, y) + "px";
}
function closePop(restore = true) {
  if (!S.pop) return;
  const anchor = $(`[data-key="${CSS.escape(S.pop.key)}"]`);
  anchor?.setAttribute("aria-expanded", "false");
  S.pop = null;
  $("#layer").innerHTML = "";
  if (restore) anchor?.focus({ preventScroll: true });
}

// 对话框与侧边面板：使用原生 dialog，Escape 关闭并恢复触发控件焦点。
let dialogOpener = null;
function openDialog(html, { cls = "", label = "" } = {}) {
  closePop(false);
  const dlg = $("#dlg");
  if (dlg.open) dlg.close();
  dialogOpener = document.activeElement?.closest?.("[data-key]")?.dataset.key || null;
  dlg.className = `dlg ${cls}`;
  dlg.setAttribute("aria-label", label);
  dlg.innerHTML = html;
  dlg.showModal();
  const first = $("[data-autofocus]", dlg) || $("input, button:not([disabled])", dlg);
  first?.focus();
  if (first?.hasAttribute("data-select")) first.select();
}
function closeDialog() {
  const dlg = $("#dlg");
  if (dlg.open) dlg.close();
}
function updateDialog(html) {
  const dlg = $("#dlg");
  if (!dlg.open) return;
  const key = document.activeElement?.closest?.("[data-key]")?.dataset.key;
  dlg.innerHTML = html;
  ((key && $(`[data-key="${CSS.escape(key)}"]`, dlg)) || $("[data-autofocus]", dlg) || $("button", dlg))?.focus();
}

let toastTimer = 0;
function toast(text, tone = "") {
  const el = $("#toast");
  el.className = `toast show ${tone}`;
  el.innerHTML = `${icon(tone === "error" ? "alert" : "check")}<span>${esc(text)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2400);
}

// 复制：沙箱 iframe 中剪贴板通常不可用，失败时给出可选中的文本。
function copyText(text, label = "链接") {
  const fail = () =>
    openDialog(
      `<div class="dlg-body"><h2 class="dlg-title">手动复制${esc(label)}</h2><p class="muted">浏览器没有允许自动复制。已选中下面的内容，按 ⌘C 或 Ctrl+C 复制。</p><input class="input mono-text" readonly value="${esc(text)}" data-autofocus data-select aria-label="${esc(label)}"><div class="dlg-actions">${btn("完成", "close-dialog", { kind: "primary" })}</div></div>`,
      { label: `手动复制${label}` },
    );
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (S.scene === "copy-fail" || !navigator.clipboard || policy?.allowsFeature?.("clipboard-write") === false) return fail();
  navigator.clipboard.writeText(text).then(() => toast(`已复制${label}`), fail);
}

const A = {};
A["close-dialog"] = closeDialog;
A["noop"] = () => {};

document.addEventListener("click", (event) => {
  if (event.target.closest(".skip-link")) {
    event.preventDefault();
    return $("#main")?.focus();
  }
  const el = event.target.closest("[data-action]");
  if (!el) {
    if (S.pop && !event.target.closest(".pop")) closePop(false);
    return;
  }
  if (el.tagName === "A") event.preventDefault();
  if (S.pop && !el.closest(".pop") && el.dataset.key !== S.pop.key) closePop(false);
  const fn = A[el.dataset.action];
  if (fn && !el.hasAttribute("disabled")) fn(el, event);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && S.pop) {
    event.preventDefault();
    event.stopPropagation();
    return closePop();
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
    event.preventDefault();
    return A["toggle-side"]();
  }
  const menu = event.target.closest('[role="menu"], [role="tablist"], [role="radiogroup"], .seg');
  if (menu && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    const vertical = menu.getAttribute("role") === "menu";
    if (!vertical && ["ArrowDown", "ArrowUp"].includes(event.key)) return;
    if (vertical && ["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const items = $$('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="tab"], [role="radio"], button', menu).filter((b) => !b.disabled && b.closest('[role="menu"], [role="tablist"], [role="radiogroup"], .seg') === menu);
    const i = items.indexOf(event.target.closest("button, [role]"));
    if (i < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    if (!vertical && menu.getAttribute("role") === "tablist") items[next].click();
  }
});
document.addEventListener("scroll", (event) => {
  const el = event.target;
  if (!(el instanceof Element) || !el.dataset?.scroll) return;
  S.scroll[el.dataset.scroll] = el.scrollTop;
  syncScrolled(el);
  if (el.classList.contains("doc-scroll")) updateToc();
}, true);
addEventListener("resize", () => {
  if (S.pop) positionPop();
  clearTimeout(resize.t);
  resize.t = setTimeout(resize, 120);
});
function resize() {
  render();
}
addEventListener("hashchange", () => {
  parseHash();
  closePop(false);
  render();
});
$("#dlg").addEventListener("close", () => {
  const key = dialogOpener;
  dialogOpener = null;
  $("#dlg").innerHTML = "";
  if (key) $(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
});
$("#dlg").addEventListener("click", (event) => {
  if (event.target === $("#dlg")) closeDialog();
});
