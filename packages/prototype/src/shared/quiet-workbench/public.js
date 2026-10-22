// ⑥ 公开原型页与 ⑦ Change 分享页：匿名只读，不显示工作台导航、账号或凭据。
function publicBar(title, extra, right) {
  return `<header class="pub-bar"><span class="pub-brand">${brandMark("", "OpenFolio")}</span><span class="pub-title clamp">${title}</span>${extra || ""}<span class="grow"></span>${right}${ibtn(S.theme === "dark" ? "浅色" : "深色", "theme-toggle", S.theme === "dark" ? "sun" : "moon", { key: "pub-theme" })}</header>`;
}
function publicView() {
  const p = protoById(S.path[1] || "offline-maps");
  const gone = S.scene === "not-found" || S.scene === "revoked" || !p;
  if (gone)
    return `<div class="public-shell">${publicBar("", "", "")}<main id="main" class="pub-main" tabindex="-1">${empty(S.scene === "revoked" ? "这个公开版本已撤回" : "没有找到这个公开版本", S.scene === "revoked" ? "发布者已撤回访问。请联系分享者获取新的链接。" : "链接可能有误，或这个版本还没有准备好。请向分享者核对链接。", "", "lock")}</main></div>`;
  if (!S.viewer.device || (p.devices && !p.devices.includes(S.viewer.device))) S.viewer.device = p.devices?.[0] || null;
  return `<div class="public-shell">${publicBar(esc(p.title), `<span class="pub-tag">固定版本 · ${p.public || "10 月 18 日"}</span>`, `${mobile() ? "" : viewerTools(p)}${btn(mobile() ? "" : "复制链接", "copy-public", { kind: "ghost", icon: "link", arg: p.id, key: "pub-copy" })}`)}<main id="main" class="pub-main viewer" tabindex="-1">${mobile() ? `<div class="pub-tools">${viewerTools(p)}</div>` : ""}${canvasArea(p, "public")}</main></div>`;
}
const syncFailedBanner = () => `<div class="banner warn" role="status">${icon("alert")}<span class="grow">同步失败，显示的是 10:24 读取的内容。稍后会自动重试。</span></div>`;
function shareView() {
  const id = S.path[1],
    c = changeById(id);
  const right = `${innerWidth < 1024 ? ibtn("材料", "pane-sheet", "panel", { popup: "dialog", key: "share-pane" }) : ""}${ibtn("阅读设置", "reading-menu", "text", { popup: "dialog", key: "share-reading" })}${mobile() ? "" : btn("复制链接", "copy-share", { kind: "ghost", icon: "link", arg: id, key: "share-copy" })}`;
  if (S.scene === "not-found" || !c || c.status === "unknown")
    return `<div class="public-shell">${publicBar("", "", "")}<main id="main" class="pub-main" tabindex="-1">${empty("内容不存在或暂不可读", "链接中的仓库或 Change 不存在，或者服务暂时无法读取它。请向分享者确认链接。", "", "lock")}</main></div>`;
  if (S.scene === "loading") return `<div class="public-shell">${publicBar("正在读取…", "", "")}<main id="main" class="pub-main" tabindex="-1">${skeleton("reader")}</main></div>`;
  const page = changeDetailView(id, true);
  return `<div class="public-shell">${publicBar(`${esc(repo().owner)}/${esc(repo().repo)}`, `<span class="pub-tag">${icon("globe")}只读分享</span>`, right)}<main id="main" class="pub-main" tabindex="-1">${page.body}</main></div>`;
}

// 视图入口
function view() {
  const r = route();
  if (r === "public") return publicView();
  if (r === "share") return shareView();
  if (r === "login" || r === "register" || !S.signedIn || S.scene === "expired") return authView();
  const page = { home: homeView, specs: specsView, changes: changesView, prototypes: prototypesView, account: accountView }[r]?.() || homeView();
  const c = collapsed(),
    m = mobile();
  return `<div class="app ${c ? "is-collapsed" : ""} ${m ? "is-mobile" : ""}">${m ? "" : sidebar(c)}<main class="surface" id="main" tabindex="-1">${toolbar(page)}<div class="surface-body">${page.body}</div></main>${m ? mobileNav() : ""}</div>`;
}
