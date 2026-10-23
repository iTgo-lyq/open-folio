// 公共壳层：评审工具、侧栏（展开 / 胶囊收起）、顶栏、账号菜单与手机导航。
const PAGES = [
  ["home", "我的仓库", "home"],
  ["specs", "Specs", "specs"],
  ["changes", "Changes 列表", "changes"],
  ["change", "Change 详情", "changes/offline-map-regions"],
  ["prototypes", "原型总览", "prototypes"],
  ["viewer", "原型预览", "prototypes/offline-maps"],
  ["account", "账号与 Token", "account"],
  ["login", "登录与注册", "login"],
  ["public", "公开原型页", "public/offline-maps"],
  ["share", "Change 分享页", "share/offline-map-regions"],
];
const COMMON = [["normal", "正常"], ["loading", "加载中"], ["error", "加载失败"], ["offline", "离线"], ["denied", "无权限"], ["expired", "登录已过期"]];
const SCENES = {
  home: [["normal", "正常"], ["discovering", "正在发现"], ["partial", "部分仓库检查失败"], ["empty", "没有发现仓库"], ["no-token", "尚未绑定 Token"], ["loading", "加载中"], ["offline", "离线"], ["expired", "登录已过期"]],
  specs: [...COMMON, ["empty", "没有 Specs"]],
  changes: [...COMMON, ["empty", "没有 Change"], ["views-saved", "已有个人视图"], ["views-no-cancelled", "取消数量为 0"], ["views-save-error", "视图保存失败（可重试）"]],
  change: [["normal", "正常"], ["missing", "材料缺失"], ["integration-error", "合入记录异常"], ["copy-fail", "复制失败"], ...COMMON.slice(1)],
  prototypes: [...COMMON, ["empty", "没有原型"]],
  viewer: [["normal", "正常"], ["loading", "加载中"], ["preview-error", "原型加载失败"], ["copy-fail", "复制失败"], ["offline", "离线"], ["denied", "无权限"]],
  account: [["normal", "正常"], ["no-token", "尚未绑定 Token"], ["token-invalid", "Token 已失效"], ["switch-failed", "切换 Token 失败"], ["copy-fail", "复制失败"], ["offline", "离线"], ["expired", "登录已过期"]],
  login: [["normal", "正常"], ["wrong-password", "账号或密码错误"], ["rate-limited", "登录暂缓"], ["duplicate", "注册：账号已存在"]],
  public: [["normal", "正常"], ["loading", "加载中"], ["not-found", "版本不存在"], ["revoked", "已撤回"], ["copy-fail", "复制失败"]],
  share: [["normal", "正常"], ["loading", "加载中"], ["not-found", "不存在或暂不可读"], ["sync-failed", "同步失败"], ["copy-fail", "复制失败"]],
};
function pageKey() {
  const r = route();
  if (r === "changes") return S.path[1] ? "change" : "changes";
  if (r === "prototypes") return S.path[1] ? "viewer" : "prototypes";
  if (r === "register") return "login";
  return SCENES[r] ? r : "home";
}
function reviewBar() {
  const key = pageKey(),
    scenes = SCENES[key] || COMMON;
  return `<span class="review-mark">${icon("eye")}<span>设计预览 · 示例数据</span></span><span class="review-tools"><label class="review-field"><span class="sr-only">页面</span><select data-review="page" aria-label="切换预览页面">${PAGES.map(([k, l]) => `<option value="${k}" ${k === key ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="review-field"><span class="sr-only">场景</span><select data-review="scene" aria-label="切换场景">${scenes.map(([k, l]) => `<option value="${k}" ${k === S.scene ? "selected" : ""}>${l}</option>`).join("")}</select></label>${ibtn(S.theme === "dark" ? "切换浅色" : "切换深色", "theme-toggle", S.theme === "dark" ? "sun" : "moon", { key: "review-theme", side: "bottom" })}${ibtn("评审设置：强调色、图标与动效", "review-settings", "settings", { key: "review-settings", popup: "dialog", side: "bottom" })}</span>`;
}
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.dataset.review === "page") {
    S.scene = "normal";
    go(PAGES.find(([k]) => k === el.value)[2]);
  } else if (el.dataset.review === "scene") {
    S.scene = el.value;
    if (S.scene === "duplicate" && route() === "login") return go("register");
    if (["wrong-password", "rate-limited"].includes(S.scene) && route() === "register") return go("login");
    go(S.path.join("/"), { replace: true });
  }
});
A["theme-toggle"] = () => {
  S.theme = S.theme === "dark" ? "light" : "dark";
  history.replaceState(null, "", hashFor(S.path.join("/")));
  render();
};
A["set-theme"] = (el) => {
  S.theme = el.dataset.arg;
  history.replaceState(null, "", hashFor(S.path.join("/")));
  render();
  refreshPop();
};
const ACCENTS = [
  ["clay", "陶土"],
  ["ink", "墨色"],
  ["blue", "蓝色 · 上一版"],
];
const switchRow = (label, action, on) => `<div class="menu-row"><span class="grow">${label}</span><button class="switch" role="switch" aria-checked="${on}" aria-label="${label}" data-action="${action}" data-key="${action}:"><i></i></button></div>`;
A["review-settings"] = (el) =>
  openPop(
    el,
    () => {
      const tile = S.accent === "blue" ? LEGACY_MARK : APP_ICON;
      return `<div class="pop-pad review-pop"><div class="pop-title">评审设置</div><div class="pop-sub">强调色</div><span class="seg sm accent-seg" role="radiogroup" aria-label="强调色">${ACCENTS.map(([k, l]) => `<button role="radio" aria-checked="${S.accent === k}" data-action="set-accent" data-arg="${k}" data-key="accent:${k}">${l}</button>`).join("")}</span><p class="menu-note">陶土为本次方案；墨色与蓝色（上一版）只作对照。</p><div class="pop-sub">标志与网站图标</div><div class="icon-preview"><span class="tab-mock" aria-hidden="true"><img src="${tile}" alt="">OpenFolio</span><span class="tab-mock dark" aria-hidden="true"><img src="${tile}" alt="">OpenFolio</span><img class="app-icon" src="${tile}" alt="应用图标"></div><div class="pop-sub">动效</div>${switchRow("减少动态效果", "toggle-motion", S.motion === "reduce")}<p class="menu-note">系统开启“减少动态效果”时自动生效；这里只用于评审。</p></div>`;
    },
    { align: "end", label: "评审设置" },
  );
A["set-accent"] = (el) => {
  S.accent = el.dataset.arg;
  history.replaceState(null, "", hashFor(S.path.join("/")));
  render();
  refreshPop();
};
A["toggle-motion"] = () => {
  S.motion = S.motion === "reduce" ? "normal" : "reduce";
  render();
  refreshPop();
};

// 侧栏：展开态是完整导航；点击 Logo 收起为悬浮胶囊。两种形态同时存在，靠类名切换以保留过渡。
const NAV = [
  ["home", "我的仓库", "home"],
  ["specs", "Specs", "book"],
  ["changes", "Changes", "change"],
  ["prototypes", "原型", "layout"],
];
const inRepo = () => ["specs", "changes", "prototypes"].includes(route());
function navCount(id) {
  if (S.scene === "loading" || !repoReadable() || !hasToken()) return "";
  if (id === "changes") return changesOf().filter((c) => c.status === "active").length || "";
  if (id === "prototypes") return prototypesOf().length || "";
  return "";
}
const repoReadable = () => repo().status === "ready" && S.scene !== "denied";
const hasToken = () => !!currentToken() && S.scene !== "no-token";
function sidebar(c) {
  const r = repo(),
    cur = route(),
    navLink = ([id, label, glyph], rail) => {
      const off = id !== "home" && !hasToken();
      return `<a class="${rail ? "cap-item" : "nav-item"}" href="#/${id}" ${attr({ "data-action": off ? "noop" : "nav", "data-arg": id, "data-key": `${rail ? "rail" : "nav"}:${id}`, "aria-current": cur === id ? "page" : undefined, "aria-disabled": off ? "true" : undefined, "aria-label": rail ? label : undefined, "data-tip": rail ? (off ? `${label}：绑定 Token 后可用` : label) : undefined, "data-tip-side": "right" })}>${icon(glyph)}${rail ? "" : `<span class="grow">${label}</span>${navCount(id) ? `<span class="count">${navCount(id)}</span>` : ""}`}</a>`;
    };
  return `<aside class="side" aria-label="工作台导航">
    <div class="side-head"><button class="logo" type="button" data-action="toggle-side" data-key="logo" aria-label="${c ? "展开侧栏" : "收起侧栏"}" aria-expanded="${!c}" data-tip="${c ? "展开侧栏" : "收起侧栏"}  ⌘\\" data-tip-side="right">${brandMark()}<span class="wordmark">OpenFolio</span></button></div>
    <div class="side-full" ${c ? "inert" : ""}>
      <nav class="side-nav" aria-label="模块">
        ${navLink(NAV[0])}
        <div class="side-group" ${hasToken() ? "" : "hidden"}>
          <button class="repo-switch" type="button" data-action="repo-menu" data-key="repo-menu" aria-haspopup="menu" aria-expanded="false">${mono(r)}<span class="grow stack"><strong>${esc(r.name)}</strong><small>${esc(r.owner)}</small></span>${icon("updown", "faint")}</button>
          ${NAV.slice(1).map((n) => navLink(n)).join("")}
        </div>
      </nav>
      <div class="side-foot">${accountButton()}</div>
    </div>
    <div class="side-rail" ${c ? "" : "inert"}>
      <nav class="capsule" aria-label="模块">${NAV.map((n) => navLink(n, true)).join("")}</nav>
      <div class="rail-foot">${accountButton(true)}</div>
    </div>
  </aside>`;
}
function accountButton(compact) {
  const t = currentToken();
  return `<button class="account-btn ${compact ? "compact" : ""} ${route() === "account" ? "on" : ""}" type="button" data-action="account-menu" data-key="${compact ? "account-rail" : "account"}" aria-haspopup="menu" aria-expanded="false" ${compact ? `aria-label="账号：${ACCOUNT.username}" data-tip="账号" data-tip-side="right"` : ""}>${avatar(ACCOUNT.person, compact ? "md" : "md")}${compact ? "" : `<span class="grow stack"><strong>${ACCOUNT.username}</strong><small>${t ? esc(t.name) : "尚未选择 Token"}</small></span>${icon("updown", "faint")}`}</button>`;
}
A["toggle-side"] = () => {
  const app = $(".app");
  if (!app || mobile()) return;
  S.collapsed = !collapsed();
  app.classList.toggle("is-collapsed", S.collapsed);
  const logo = $(".logo", app);
  const label = S.collapsed ? "展开侧栏" : "收起侧栏";
  logo.setAttribute("aria-label", label);
  logo.setAttribute("aria-expanded", String(!S.collapsed));
  logo.dataset.tip = `${label}  ⌘\\`;
  $(".side-full", app).toggleAttribute("inert", S.collapsed);
  $(".side-rail", app).toggleAttribute("inert", !S.collapsed);
  closePop(false);
};
A["nav"] = (el) => {
  const id = el.dataset.arg;
  if (id === "changes" && route() === "changes" && S.path[1]) return go("changes");
  go(id === "specs" ? specsPath() : id);
};
A["repo-menu"] = (el) =>
  openPop(el, () => {
    const ready = [...REPOS, ...(S.moreRepos ? MORE_REPOS : [])].filter((r) => r.status === "ready");
    return `<div class="menu" role="menu" aria-label="切换仓库"><div class="menu-label">切换仓库</div>${ready.map((r) => `<button class="menu-item" role="menuitemradio" aria-checked="${r.id === S.repo}" data-action="pick-repo" data-arg="${r.id}" data-key="pick-repo:${r.id}">${mono(r, "sm")}<span class="grow stack"><span>${esc(r.name)}</span><small>${esc(r.owner)}/${esc(r.repo)}</small></span>${r.id === S.repo ? icon("check", "accent") : ""}</button>`).join("")}<div class="menu-sep"></div><button class="menu-item" role="menuitem" data-action="nav" data-arg="home" data-key="menu-home">${icon("home")}<span class="grow">所有仓库</span></button></div>`;
  }, { label: "切换仓库", cls: "wide" });
A["pick-repo"] = (el) => {
  S.repo = el.dataset.arg;
  S.scroll = {};
  closePop(false);
  const r = route();
  go(inRepo() ? (r === "specs" ? specsPath() : r) : "specs");
};
A["account-menu"] = (el) =>
  openPop(el, () => {
    const tokens = S.tokens;
    return `<div class="menu account-menu" role="menu" aria-label="账号"><div class="menu-head">${avatar(ACCOUNT.person, "lg")}<span class="stack"><strong>${ACCOUNT.username}</strong><small>OpenFolio 账号</small></span></div><div class="menu-sep"></div><div class="menu-label">使用的 Token</div>${tokens.length ? tokens.map((t) => `<button class="menu-item" role="menuitemradio" aria-checked="${t.id === S.token}" data-action="use-token" data-arg="${t.id}" data-key="use-token-menu:${t.id}">${icon("key")}<span class="grow stack"><span>${esc(t.name)}</span><small>${t.platform} · ${esc(t.login)}</small></span>${t.id === S.token ? icon("check", "accent") : ""}</button>`).join("") : `<div class="menu-note">尚未绑定 Token。</div>`}<button class="menu-item" role="menuitem" data-action="go" data-arg="account" data-key="menu-account">${icon("settings")}<span class="grow">账号与 Token</span></button><div class="menu-sep"></div><div class="menu-row"><span class="grow">外观</span><span class="seg sm" role="radiogroup" aria-label="外观">${["light", "dark"].map((t) => `<button role="radio" aria-checked="${S.theme === t}" data-action="set-theme" data-arg="${t}" data-key="theme:${t}">${icon(t === "light" ? "sun" : "moon")}<span>${t === "light" ? "浅色" : "深色"}</span></button>`).join("")}</span></div><div class="menu-sep"></div><button class="menu-item" role="menuitem" data-action="sign-out" data-key="menu-signout">${icon("logout")}<span class="grow">退出登录</span></button></div>`;
  }, { label: "账号", side: mobile() ? "bottom" : "top", align: mobile() ? "end" : "start", cls: "wide" });
A["go"] = (el) => go(el.dataset.arg);
A["sign-out"] = () => {
  closeDialog();
  S.signedIn = false;
  S.scene = "normal";
  go("login");
};

// 顶栏：展开侧栏时不重复仓库信息；收起或手机时出现紧凑的仓库切换。
function toolbar(page) {
  const showRepo = inRepo() && !page.hideRepo;
  return `<header class="toolbar">
    <div class="tb-left">${showRepo ? `<button class="tb-repo" type="button" data-action="repo-menu" data-key="tb-repo" aria-haspopup="menu" aria-expanded="false" aria-label="当前仓库：${esc(repo().name)}，切换仓库">${mono(repo(), "sm")}<span>${esc(repo().name)}</span>${icon("down", "faint")}</button>` : mobile() && !page.left ? `<span class="tb-brand">${brandMark("", "OpenFolio")}</span>` : ""}${page.left || ""}</div>
    <div class="tb-right">${page.right || ""}${page.noSync ? "" : syncButton()}${mobile() && !page.noAccount ? accountButton(true) : ""}</div>
  </header>`;
}
function syncButton() {
  const s = S.scene;
  if (!hasToken()) return "";
  const state = s === "loading" || s === "discovering" ? "busy" : s === "offline" ? "off" : ["error", "denied", "token-invalid"].includes(s) ? "bad" : "ok",
    label = s === "denied" ? "无权限" : s === "token-invalid" ? "Token 失效" : { busy: "正在读取", off: "离线", bad: "同步失败", ok: "已同步" }[state];
  return `<button class="sync ${state}" type="button" data-action="sync-menu" data-key="sync" aria-haspopup="dialog" aria-expanded="false" aria-label="同步状态：${label}"><span class="sync-dot" aria-hidden="true"></span><span class="sync-label">${label}</span></button>`;
}
A["sync-menu"] = (el) =>
  openPop(el, () => {
    const r = repo(),
      s = S.scene,
      c = route() === "changes" && S.path[1] ? changeById(S.path[1]) : null;
    const status = s === "offline" ? `<p class="pop-note warn">${icon("offline")}离线中。显示的是 10:24 读取的内容，恢复网络后自动更新。</p>` : s === "error" ? `<p class="pop-note bad">${icon("alert")}最近一次读取失败（GitHub 返回 502）。已显示的内容来自 10:24。</p>` : "";
    return `<div class="pop-pad"><div class="pop-title">读取来源</div><dl class="kv"><dt>仓库</dt><dd>${esc(r.owner)}/${esc(r.repo)}</dd><dt>分支</dt><dd><code>${esc(c && c.branch !== "develop" ? c.branch : r.branch)}</code></dd><dt>提交</dt><dd><code>9de1e5a</code> · 10:24</dd><dt>Token</dt><dd>${esc(currentToken()?.name || "未选择")}</dd></dl>${status}<div class="pop-actions">${btn("刷新", "refresh", { icon: "refresh", kind: "sm" })}</div></div>`;
  }, { align: "end", label: "读取来源", cls: "sync-pop" });
A["refresh"] = () => {
  closePop();
  S.scene = "loading";
  render();
  setTimeout(() => {
    S.scene = "normal";
    history.replaceState(null, "", hashFor(S.path.join("/")));
    render();
    toast("已更新到最新推送");
  }, 700);
};
function mobileNav() {
  const cur = route();
  return `<nav class="mnav" aria-label="模块">${NAV.map(([id, label, glyph]) => {
    const off = id !== "home" && !hasToken();
    return `<a href="#/${id}" class="mnav-item" data-action="${off ? "noop" : "nav"}" data-arg="${id}" data-key="mnav:${id}" ${cur === id ? 'aria-current="page"' : ""} ${off ? 'aria-disabled="true"' : ""}>${icon(glyph)}<span>${label === "我的仓库" ? "仓库" : label}</span></a>`;
  }).join("")}</nav>`;
}

// 各页面共用的状态：加载、失败、无权限与离线提示。
function sceneGate(kind = "page") {
  const s = S.scene;
  if (s === "loading") return { body: skeleton(kind) };
  if (s === "error")
    return { body: empty("没能读取这个仓库", "GitHub 暂时没有响应（502）。已有内容没有改变，可以稍后重试。", btn("重试", "refresh", { icon: "refresh" }), "alert") };
  if (s === "denied")
    return { body: empty("无法读取这个仓库", `当前 Token「${esc(currentToken()?.name || "")}」没有 ${esc(repo().owner)}/${esc(repo().repo)} 的读取权限。私有内容已从本页清除。`, btn("切换 Token", "account-menu-proxy", { kind: "primary" }) + btn("回到我的仓库", "go", { arg: "home" }), "lock") };
  return null;
}
A["account-menu-proxy"] = () => {
  const target = $('[data-action="account-menu"]');
  if (target) A["account-menu"](target);
};
const offlineBanner = () =>
  S.scene === "offline" ? `<div class="banner warn" role="status">${icon("offline")}<span class="grow">离线中，显示的是 10:24 读取的内容。恢复网络后自动更新。</span></div>` : "";
function skeleton(kind) {
  const line = (w) => `<span class="sk" style="width:${w}"></span>`;
  if (kind === "reader")
    return `<div class="reader"><div class="pane">${Array.from({ length: 7 }, (_, i) => line(i % 3 ? "70%" : "50%")).join("")}</div><div class="doc-scroll"><article class="doc"><span class="sk h1"></span>${Array.from({ length: 9 }, (_, i) => line(i % 4 === 3 ? "60%" : "100%")).join("")}</article></div></div>`;
  return `<div class="page"><div class="page-inner"><span class="sk h1" style="width:180px"></span>${Array.from({ length: 6 }, () => `<div class="sk-row"><span class="sk dot"></span><span class="grow">${line("40%")}${line("24%")}</span></div>`).join("")}<span class="sr-only" role="status">正在读取</span></div></div>`;
}
