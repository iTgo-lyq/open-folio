(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const brand = "{{data:../../assets/mark.png}}";
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    book: '<path d="M12 7v14M3 18V4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v14h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3z"/>',
    change:
      '<circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M6 8v13m7-17h2a3 3 0 0 1 3 3v9m-5-9 3-3-3-3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    refresh:
      '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    moon: '<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    branch:
      '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 8v8m0-3c8 0 12-1 12-5"/>',
    sidebar:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m-3-9h0"/>',
    settings:
      '<path d="M4 7h5m6 0h5M4 17h9m6 0h1"/><circle cx="12" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
    file: '<path d="M14 2H5v20h14V7zm0 0v5h5M8 12h8m-8 4h6"/>',
    folder: '<path d="M3 6h7l2 3h9v11H3zM3 6V4h6l2 2h9v3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    link: '<path d="m10 13 4-4m-5 8-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2" transform="translate(1 0) scale(.9)"/>',
    external: '<path d="M14 3h7v7m0-7L10 14m1-9H3v16h16v-8"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    monitor:
      '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/>',
    phone:
      '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    logout: '<path d="M9 3H3v18h6m6-14 5 5-5 5m-7-5h12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    board:
      '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/>',
    network:
      '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4H5v4m7-4h7v4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
    wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0m-3 4h.01M3 3l18 18"/>',
  };
  const icon = (n) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[n] || paths.file}</svg>`;
  const action = (label, name, glyph = "", kind = "", extra = "") =>
    `<button class="btn ${kind}" data-action="${name}" ${extra}>${glyph ? icon(glyph) : ""}${label}</button>`;
  const ib = (label, name, glyph, extra = "") =>
    `<button class="icon-btn ${extra.match(/class="([^"]*)"/)?.[1] || ""}" aria-label="${esc(label)}" title="${esc(label)}" data-action="${name}" ${extra.replace(/class="[^"]*"/, "")}>${icon(glyph)}</button>`;
  const badge = (label, tone = "", glyph = "") =>
    `<span class="badge ${tone}">${glyph ? icon(glyph) : ""}${esc(label)}</span>`;
  const titles = {
    home: "我的仓库",
    specs: "Specs",
    changes: "Changes",
    prototypes: "原型",
    credentials: "当前凭据",
    public: "公开原型",
    viewer: "原型预览",
    login: "登录工作台",
  };
  const repos = [
    {
      id: "atlas",
      name: "Atlas",
      path: "demo-studio / atlas",
      description: "把项目里的想法、决策与交付整理在一起。",
      color: "",
      symbol: "A",
      status: "ready",
    },
    {
      id: "folio",
      name: "Folio",
      path: "demo-studio / folio",
      description: "为团队保留清晰、连续的工程记录。",
      color: "sage",
      symbol: "F",
      status: "ready",
    },
    {
      id: "fieldnotes",
      name: "Field Notes",
      path: "demo-lab / field-notes",
      description: "轻量工具与日常工作方式的实验。",
      color: "sand",
      symbol: "N",
      status: "ready",
    },
    {
      id: "design-kit",
      name: "Design Kit",
      path: "demo-lab / design-kit",
      description: "协作分支中的项目配置需要核对。",
      color: "gray",
      symbol: "D",
      status: "attention",
    },
    {
      id: "archive",
      name: "Archive",
      path: "demo-lab / archive",
      description: "连接想法与它们背后的来由。",
      color: "gray",
      symbol: "R",
      status: "ready",
    },
  ];
  const docs = [
    ["overview", "项目知识工作台"],
    ["discovery", "仓库发现与来源"],
    ["access", "身份与访问权限"],
    ["reading", "工程记录阅读"],
    ["previews", "原型与公开分享"],
  ];
  const changes = [
    {
      id: "reading-context",
      title: "让阅读从上次的位置继续",
      dependsOn: ["source-details"],
      stage: "验收中",
      phase: "close",
      size: "medium",
      tone: "amber",
      scope: "active",
      done: 3,
      total: 3,
      waiting: "confirmation",
      spec: "reading",
      group: "阅读体验",
      description: "保留文档目录、阅读位置与来源，让项目切换和连续阅读更自然。",
    },
    {
      id: "prototype-canvas",
      title: "原型预览的设备与画布",
      stage: "执行",
      phase: "execution",
      size: "large",
      tone: "blue",
      scope: "active",
      done: 2,
      total: 4,
      waiting: "",
      spec: "previews",
      group: "",
      description: "在清晰的画布中切换设备，保留固定版本与返回路径。",
    },
    {
      id: "document-links",
      title: "更清楚的文档链接反馈",
      stage: "需求",
      phase: "requirement",
      size: "small",
      tone: "",
      scope: "active",
      done: 0,
      total: 1,
      waiting: "confirmation",
      spec: "reading",
      group: "阅读体验",
      description: "将缺失文档和不支持的链接区分呈现，并提供可行的返回操作。",
    },
    {
      id: "permission-refresh",
      title: "仓库权限检查与失败恢复",
      stage: "任务阻塞",
      phase: "execution",
      size: "medium",
      tone: "red",
      scope: "active",
      done: 1,
      total: 2,
      waiting: "blocked",
      spec: "access",
      group: "",
      description: "网络暂时失败时保留阅读；明确失权时清理私有内容。",
    },
    {
      id: "source-details",
      title: "按需查看记录来源",
      stage: "已归档",
      phase: "close",
      size: "medium",
      tone: "green",
      scope: "archived",
      done: 2,
      total: 2,
      waiting: "",
      spec: "reading",
      group: "阅读体验",
      description: "让来源信息可追溯，也让正文保持安静。",
    },
    {
      id: "legacy-layout",
      title: "旧阅读布局探索",
      stage: "已取消",
      phase: "requirement",
      size: "small",
      tone: "",
      scope: "cancelled",
      done: 0,
      total: 1,
      waiting: "",
      spec: "reading",
      group: "",
      description: "布局方向调整，保留原讨论供追溯。",
    },
    {
      id: "missing-source",
      title: "项目配置阅读",
      stage: "来源异常",
      phase: "requirement",
      size: "small",
      tone: "red",
      scope: "invalid",
      done: 0,
      total: 1,
      waiting: "",
      spec: "access",
      group: "",
      description: "登记的工作分支不可读取，无法确定当前进度。",
    },
  ];
  const prototypes = [
    {
      id: "reading",
      title: "文档阅读工作面",
      description: "能力目录、正文与按需出现的来源。",
      kind: "page",
      devices: ["pc-web", "ipad", "mobile"],
      route: "specs",
    },
    {
      id: "workspace",
      title: "项目与仓库入口",
      description: "找到项目，继续阅读工程记录。",
      kind: "page",
      devices: ["pc-web", "ipad", "mobile"],
      route: "home",
    },
    {
      id: "change",
      title: "变更详情",
      description: "澄清、任务与合入依据，循序展开。",
      kind: "page",
      devices: ["pc-web", "ipad", "mobile"],
      route: "changes",
    },
    {
      id: "switcher",
      title: "身份切换器",
      description: "明确当前身份，保留各自工作台。",
      kind: "component",
      devices: ["pc-web", "ipad", "mobile"],
      route: "credentials",
    },
  ];
  const mqMotion = matchMedia("(prefers-reduced-motion: reduce)"),
    mqTransparency = matchMedia("(prefers-reduced-transparency: reduce)");
  const state = {
    theme: "light",
    material:
      CSS.supports("backdrop-filter", "blur(1px)") &&
      matchMedia("(prefers-reduced-transparency: no-preference)").matches
        ? "glass"
        : "solid",
    motion: mqMotion.matches ? "reduce" : "normal",
    scene: "normal",
    route: document.body.dataset.start || "home",
    repo: "atlas",
    doc: "overview",
    collapsed: false,
    repoFilter: "all",
    repoLimit: 4,
    scope: "active",
    view: "list",
    granularity: "changes",
    stage: "",
    size: "",
    wait: "",
    spec: "",
    protoKind: "all",
    protoDevice: "all",
    protoLimit: 3,
    preview: "reading",
    device: "pc-web",
    landscape: false,
    zoom: false,
    token: "demo",
    remembered: ["demo", "demo-other"],
    login: true,
    labels: { demo: "日常阅读", "demo-other": "项目协作" },
    devices: {
      demo: ["current", "phone", "tablet"],
      "demo-other": ["current", "phone"],
    },
    detail: "reading-context",
    tab: "overview",
    file: 0,
    scroll: {},
    demoSection: "overview",
  };
  const routeParams = () => {
    const [route, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
    return { route, params: new URLSearchParams(query) };
  };
  function applyHash() {
    const { route, params } = routeParams();
    if (titles[route]) state.route = route;
    if (["light", "dark"].includes(params.get("theme")))
      state.theme = params.get("theme");
    if (params.has("scene")) state.scene = params.get("scene");
    if (docs.some(([id]) => id === params.get("doc")))
      state.doc = params.get("doc");
    if (prototypes.some((p) => p.id === params.get("preview")))
      state.preview = params.get("preview");
    if (
      params.has("change") &&
      changes.some((c) => c.id === params.get("change"))
    )
      state.detail = params.get("change");
  }
  applyHash();
  const availableRepos = () =>
    state.token === "demo-other"
      ? repos.filter((r) => ["fieldnotes", "design-kit"].includes(r.id))
      : repos;
  const repo = () =>
    availableRepos().find((r) => r.id === state.repo) || availableRepos()[0];
  const workspacePreferences = {};
  const preferenceKeys = [
    "repo",
    "doc",
    "repoFilter",
    "repoLimit",
    "scope",
    "view",
    "granularity",
    "stage",
    "size",
    "wait",
    "spec",
    "taskStatus",
    "protoKind",
    "protoDevice",
    "protoLimit",
    "collapsed",
  ];
  function switchWorkspace(token) {
    workspacePreferences[state.token] = Object.fromEntries(
      preferenceKeys.map((k) => [k, state[k]]),
    );
    state.token = token;
    Object.assign(
      state,
      {
        repo: token === "demo" ? "atlas" : "fieldnotes",
        doc: "overview",
        repoFilter: "all",
        repoLimit: 4,
        scope: "active",
        view: "list",
        granularity: "changes",
        stage: "",
        size: "",
        wait: "",
        spec: "",
        taskStatus: "",
        protoKind: "all",
        protoDevice: "all",
        protoLimit: 3,
      },
      workspacePreferences[token] || {},
    );
    state.scroll = {};
  }
  const href = (route, params = {}) =>
    "#/" +
    route +
    (Object.keys(params).length ? "?" + new URLSearchParams(params) : "");
  const link = (route, label, glyph = "", extra = "") =>
    `<a href="${href(route)}" data-route="${route}" ${extra}>${glyph ? icon(glyph) : ""}${label}</a>`;
  function go(route, params = {}) {
    state.scroll[state.route] = window.scrollY;
    if (!["unpublished", "offline", "denied", "expired"].includes(state.scene))
      state.scene = "normal";
    if (state.route === "viewer" && route === "prototypes")
      state.restoreCard = state.preview;
    state.route = route;
    const hash = href(route, params);
    if (location.hash === hash) {
      render();
      restoreScroll();
    } else {
      location.hash = hash;
      applyHash();
      render();
      restoreScroll();
    }
  }
  function restoreScroll() {
    requestAnimationFrame(() => {
      window.scrollTo(0, state.scroll[state.route] || 0);
      if (state.restoreCard && state.route === "prototypes") {
        $(`[data-preview="${state.restoreCard}"]`)?.focus({
          preventScroll: true,
        });
        state.restoreCard = null;
      }
    });
  }
  function toast(text) {
    clearTimeout(toast.timer);
    $("#toast").textContent = text;
    $("#toast").classList.add("show");
    toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3200);
  }
  function notice(text, tone = "") {
    return `<div class="notice ${tone}" role="status">${icon(tone === "error" ? "alert" : "info")}<span class="grow">${text}</span>${action("重试", "recover", "", "quiet")}</div>`;
  }
  function empty(title, description, buttons = "", glyph = "folder") {
    return `<div class="empty"><span class="empty-icon">${icon(glyph)}</span><h2>${title}</h2><p>${description}</p><div class="row wrap">${buttons}</div></div>`;
  }
  function head(title, description, controls = "", eyebrow = "") {
    return `<div class="page-head between"><div class="grow">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1><p>${description}</p></div>${controls}</div>`;
  }
  function sceneNotice() {
    if (state.scene === "offline")
      return notice("网络连接暂时中断。以下为已读取内容，尚未更新。", "");
    if (state.scene === "partial")
      return notice("部分仓库尚未检查完成。你可以先阅读已发现的项目。");
    if (state.scene === "error")
      return notice("本次更新失败，已保留上次读取内容。请稍后重试。", "error");
    return "";
  }
  function blocked() {
    if (state.scene === "denied")
      return empty(
        "暂时无法访问这个仓库",
        "当前凭据已失去读取权限，私有内容已清除。请检查凭据或选择其他仓库。",
        action("返回我的仓库", "go-home", "", "primary") +
          action("查看当前凭据", "go-credentials"),
        "lock",
      );
    if (state.scene === "expired" || !state.login)
      return empty(
        "登录后继续阅读",
        "当前身份已退出或授权已失效。你仍可以选择本浏览器的其他身份。",
        action("登录工作台", "login", "", "primary") +
          action("选择身份", "go-credentials"),
        "lock",
      );
    return "";
  }
  const navItems = [
    ["home", "home", "我的仓库"],
    ["specs", "book", "Specs"],
    ["changes", "change", "Changes"],
    ["prototypes", "grid", "原型"],
  ];
  function nav(mobile = false) {
    return navItems
      .map(([route, glyph, label]) =>
        link(
          route,
          `<span>${mobile && route === "home" ? "仓库" : label}</span>`,
          glyph,
          `class="${mobile ? "" : "nav-link"} ${state.route === route || (route === "prototypes" && state.route === "viewer") ? "active" : ""}" ${state.route === route ? 'aria-current="page"' : ""}`,
        ),
      )
      .join("");
  }
  function shell(content, reading = false) {
    return `<div class="shell ${state.collapsed ? "collapsed" : ""}"><aside class="sidebar"><a class="brand" href="#/home" data-route="home"><img src="${brand}" alt=""><span>OpenFolio</span></a><button class="workspace-switch glass" data-action="pick-repo" aria-label="切换项目"><span class="symbol ${repo().color}">${repo().symbol}</span><span class="stack grow"><strong>${["home", "credentials", "login"].includes(state.route) ? "我的工作台" : repo().name}</strong><small class="muted">${state.login ? "demo-studio" : "尚未登录"}</small></span>${icon("down")}</button><div class="nav-label">工作空间</div><nav class="nav-list" aria-label="工作台导航">${nav()}</nav><div class="sidebar-foot"><button class="identity-button" data-action="go-credentials" aria-label="当前凭据"><span class="avatar">${state.login ? "林" : "·"}</span><span class="stack grow"><strong class="small">${state.login ? esc(state.labels[state.token]) : "登录工作台"}</strong><small class="muted">${state.login ? "demo-lin · GitHub" : "使用自己的 Token"}</small></span></button></div></aside><section class="surface"><header class="topbar"><div class="breadcrumb row">${ib(state.collapsed ? "展开侧栏" : "收起侧栏", "collapse", "sidebar", 'class="collapse-control"')}<span>${["home", "credentials", "login"].includes(state.route) ? "工作台" : repo().name}</span>${icon("chevron")}<span>${titles[state.route]}</span></div><div class="top-actions">${state.route === "viewer" ? action("返回总览", "go-prototypes", "back", "quiet") : ""}${state.route === "specs" ? ib("打开能力目录", "directory", "list", 'class="mobile-directory"') : ""}<button class="reading-status" data-action="source">${{ loading: "正在读取", offline: "离线 · 未更新", error: "更新失败", denied: "无权限", expired: "未登录" }[state.scene] || (state.login ? "已读取 · 刚刚" : "未登录")}</button>${ib("查看读取来源", "source", "info")}${ib("刷新当前页面", "refresh", "refresh")}${ib(state.theme === "light" ? "切换深色主题" : "切换浅色主题", "theme", state.theme === "light" ? "moon" : "sun")}${ib("当前凭据", "go-credentials", "settings")}</div></header><main id="main" tabindex="-1" class="${reading ? "" : "content " + (state.route === "home" ? "home-content" : "")}">${content}</main></section></div><nav class="mobile-nav glass" aria-label="移动导航">${nav(true)}</nav>`;
  }
  const sceneNames = {
    normal: "正常状态",
    loading: "加载中",
    empty: "暂无内容",
    "no-match": "筛选无匹配",
    partial: "部分发现失败",
    error: "更新失败",
    offline: "离线",
    denied: "无权限",
    expired: "会话失效",
    "switch-error": "身份切换失败",
    "copy-error": "复制失败",
    "source-error": "来源异常",
    "missing-material": "材料缺失",
    unpublished: "未发布",
    revoked: "公开版本已撤回",
    "integration-error": "合入记录异常",
  };
  function reviewStrip() {
    const routes = [
      "home",
      "specs",
      "changes",
      "prototypes",
      "credentials",
      "public",
    ];
    const allowed = ["normal", "loading", "empty", "error", "offline"];
    if (state.route === "home")
      allowed.push("no-match", "partial", "denied", "expired");
    if (state.route === "specs")
      allowed.push("denied", "expired", "copy-error");
    if (state.route === "changes")
      allowed.push(
        "no-match",
        "denied",
        "expired",
        "source-error",
        "missing-material",
        "integration-error",
      );
    if (state.route === "prototypes" || state.route === "viewer")
      allowed.push("no-match", "unpublished", "copy-error");
    if (state.route === "credentials" || state.route === "login")
      allowed.push("expired", "switch-error", "copy-error");
    if (state.route === "public") allowed.push("unpublished", "revoked");
    if (!allowed.includes(state.scene)) allowed.push(state.scene);
    $("#review").innerHTML =
      `<span><i class="dot"></i>设计预览 <span class="review-extra">· 六组页面 · 仅示例数据</span></span><div class="row"><select id="review-page" aria-label="预览页面">${routes.map((r) => `<option value="${r}" ${r === state.route ? "selected" : ""}>${titles[r]}</option>`).join("")}</select><select id="review-scene" aria-label="原型场景">${allowed.map((s) => `<option value="${s}" ${state.scene === s ? "selected" : ""}>${sceneNames[s]}</option>`).join("")}</select><button data-action="review" aria-label="原型评审设置">${icon("settings")}</button></div>`;
  }
  function render() {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.material = mqTransparency.matches
      ? "solid"
      : state.material;
    document.documentElement.dataset.motion = mqMotion.matches
      ? "reduce"
      : state.motion;
    document.title = `${titles[state.route]} · OpenFolio 设计预览`;
    reviewStrip();
    if (state.route === "public") {
      $("#app").innerHTML = publicPage();
      fitCanvas();
      return;
    }
    let content = "";
    const stop = !["credentials", "login"].includes(state.route) && blocked();
    if (stop) content = shell(stop);
    else if (state.route === "specs") content = shell(specs(), true);
    else if (state.route === "viewer") content = shell(viewer(), true);
    else
      content = shell(
        (
          {
            home,
            changes: changePage,
            prototypes: prototypePage,
            credentials,
            login: loginPage,
          }[state.route] || home
        )(),
      );
    $("#app").innerHTML = content;
    fitCanvas();
  }
  function home() {
    let content = head(
      "我的仓库",
      "从一个项目开始，读懂它的现在。",
      action("检查仓库", "check-repo", "plus"),
      "个人工作台",
    );
    content += sceneNotice();
    if (state.scene === "loading")
      return (
        content +
        notice("正在发现仓库，已发现的项目可以先打开。", "info") +
        skeleton()
      );
    if (state.scene === "empty")
      return (
        content +
        empty(
          "还没有发现仓库",
          "用当前 Token 自动发现已接入 SpecTrail 的仓库，也可以检查一个仓库地址。",
          action("重新发现", "discover", "refresh", "primary") +
            action("检查仓库", "check-repo"),
        )
      );
    content += `<div class="toolbar">${segments(
      "repo-filter",
      [
        ["all", "全部"],
        ["ready", "可阅读"],
        ["attention", "需要关注"],
      ],
      state.repoFilter,
    )}<span class="small muted">GitHub · demo-lin</span></div>`;
    const filtered =
      state.scene === "no-match"
        ? []
        : availableRepos().filter(
            (r) => state.repoFilter === "all" || r.status === state.repoFilter,
          );
    if (!filtered.length)
      content += empty(
        "没有匹配的仓库",
        "试试其他状态，或清除当前筛选。",
        action("清除筛选", "clear-repos", "", "primary"),
      );
    else
      content += `<div class="repo-list"><div class="list-heading"><span>项目</span><span>阅读来源</span><span>状态</span><span></span></div>${filtered
        .slice(0, state.repoLimit)
        .map(
          (r) =>
            `<a class="repo-row" href="#/specs" data-repo="${r.id}"><div class="row"><span class="symbol ${r.color}">${r.symbol}</span><div class="grow"><strong>${r.name}</strong><span class="path">${r.path}</span><p>${r.description}</p></div></div><span class="source row">${icon("branch")}develop</span><span class="state-cell">${badge(r.status === "ready" ? "可阅读" : "需要关注", r.status === "ready" ? "green" : "amber", r.status === "ready" ? "check" : "alert")}</span>${icon("chevron")}</a>`,
        )
        .join(
          "",
        )}</div><div class="list-footer between"><span>仅显示当前凭据已发现的仓库</span>${filtered.length > state.repoLimit ? action("加载更多", "more-repos", "", "quiet") : action("重新发现", "discover", "refresh", "quiet")}</div>`;
    return (
      content +
      `<div class="subnote">${icon("book")}<div><strong>工程记录，保持在一起</strong><p>Specs 描述当前能力，Changes 留下决策与交付，原型让想法变得可见。</p></div></div>`
    );
  }
  function skeleton() {
    return `<div aria-label="正在加载" role="status"><span class="sr-only">正在加载</span>${Array.from({ length: 4 }, () => '<div style="padding:18px 0;border-bottom:1px solid var(--line)"><div class="skeleton title"></div><div class="skeleton"></div><div class="skeleton short"></div></div>').join("")}</div>`;
  }
  function segments(group, items, selected) {
    return `<div class="segments" role="group" aria-label="${group === "repo-filter" ? "仓库状态" : group === "scope" ? "变更范围" : group === "view" ? "显示方式" : group === "kind" ? "原型类型" : "浏览方式"}">${items.map(([key, label]) => `<button data-select="${group}" data-value="${key}" aria-pressed="${selected === key}" class="${selected === key ? "active" : ""}">${label}</button>`).join("")}</div>`;
  }
  function select(name, label, items, current) {
    return `<select class="filter-select" data-filter="${name}" aria-label="${label}">${items.map(([v, l]) => `<option value="${v}" ${v === current ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }
  function directory() {
    return `<div class="section-caption">能力目录</div><button class="tree-item tree-folder" data-action="tree-toggle" aria-expanded="true">${icon("down")}项目知识</button><div id="tree-children">${docs.map(([id, title]) => `<button class="tree-item ${id === "overview" ? "" : "child"} ${id === state.doc ? "active" : ""}" data-doc="${id}" ${id === state.doc ? 'aria-current="page"' : ""}>${icon(id === "overview" ? "book" : "file")}<span>${title}</span></button>`).join("")}</div><div class="toc"><div class="section-caption">本文目录</div>${[
      ["purpose", "能力与边界"],
      ["workflow", "从项目开始"],
      ["source", "明确的阅读来源"],
    ]
      .map(([id, t]) => `<a href="#${id}" data-anchor="${id}">${t}</a>`)
      .join("")}</div>`;
  }
  function documentBody() {
    const title = docs.find(([id]) => id === state.doc)?.[1] || docs[0][1];
    return `<div class="doc-label">${icon("book")}项目知识 / ${state.doc === "overview" ? "概览" : "能力说明"}</div><h1>${title}</h1><p class="lead">${state.doc === "overview" ? "在一个安静的工作空间里，阅读项目的规格、变化与原型。让每个决定，都能找到它的来处。" : state.doc === "access" ? "用自己的 Token 访问项目，在不同身份之间保留明确的边界。" : state.doc === "previews" ? "用固定的版本交流设计，让每次反馈都落在同一个画面上。" : "保持目录、正文和来源的连续性，让阅读更专注。"}</p><div class="doc-meta"><span>${icon("branch")} develop</span><span>只读文档</span><span>示例快照 · 2026-10-20</span></div><h2 id="purpose">能力与边界</h2><p>工程记录由项目仓库维护，工作台负责清晰地呈现。你可以阅读当前的能力约定，追踪一个 Change 的讨论与交付，也可以查看对应的交互原型。</p><div class="doc-callout">${icon("info")}<p><strong>内容来自中心仓库的已推送记录。</strong><br>工作台不会修改文档、推进流程，或把原型中的演示当成已经交付的能力。</p></div><h2 id="workflow">从项目开始</h2><p>选择一个可阅读的仓库，进入 Specs。能力目录保留文档的组织方式，章节导航帮助你在长文中定位。你可以打开关联材料，再回到原来的阅读位置。</p><table class="doc-table"><thead><tr><th>入口</th><th>可以了解什么</th></tr></thead><tbody><tr><td>Specs</td><td>当前已实现的能力与稳定约定</td></tr><tr><td>Changes</td><td>目标、澄清、任务与交付依据</td></tr><tr><td>原型</td><td>设计方案、适配设备与固定预览</td></tr></tbody></table><figure class="doc-figure"><button data-action="view-image" aria-label="放大示例项目图像"><img src="${brand}" alt="示例项目标记"></button><figcaption>仓库内图片 · 点击查看</figcaption></figure><h2 id="source">明确的阅读来源</h2><p>Specs 采用项目协作分支。进行中的 Change 按登记的工作分支读取完整记录，已归档的交付保留其历史依据。来源、提交与文件路径可在需要时展开查看。</p><p>临时网络故障会保留已经显示的内容，并提示更新失败。明确失去访问权限后，私有正文会被清除。阅读链接只保存位置，不包含访问凭据。</p><div class="doc-bottom">${action("查看原文", "raw", "file", "quiet")}${action("复制阅读链接", "share-doc", "link", "quiet")}</div>`;
  }
  function specs() {
    let body =
      state.scene === "loading"
        ? skeleton()
        : state.scene === "empty"
          ? empty(
              "还没有 Specs",
              "这个项目尚未提供能力文档。可以查看 Changes，或返回项目列表。",
              action("查看 Changes", "go-changes", "", "primary"),
            )
          : documentBody();
    return `<div class="reading-layout"><aside class="doc-nav">${directory()}</aside><article class="document">${sceneNotice()}${body}</article></div>`;
  }
  function changePage() {
    let content = head(
      "Changes",
      "让变化有上下文，让交付有依据。",
      "",
      "项目记录",
    );
    content += sceneNotice();
    content += `<div class="toolbar">${segments(
      "scope",
      [
        ["active", "进行中"],
        ["archived", "已归档"],
        ["cancelled", "已取消"],
        ["invalid", "来源异常"],
      ],
      state.scope,
    )}${segments(
      "granularity",
      [
        ["changes", "变更"],
        ["tasks", "任务"],
      ],
      state.granularity,
    )}</div>`;
    content += `<div class="filters">${
      state.scope === "active"
        ? select(
            "stage",
            "阶段",
            [
              ["", "所有阶段"],
              ["requirement", "需求"],
              ["technical", "技术"],
              ["plan", "计划"],
              ["execution", "执行"],
              ["close", "验收"],
            ],
            state.stage,
          )
        : ""
    }${select(
      "size",
      "规模",
      [
        ["", "所有规模"],
        ["small", "small"],
        ["medium", "medium"],
        ["large", "large"],
      ],
      state.size,
    )}${
      state.scope === "active"
        ? select(
            "wait",
            "等待或阻塞",
            [
              ["", "等待 / 阻塞"],
              ["confirmation", "等待确认"],
              ["blocked", "任务阻塞"],
            ],
            state.wait,
          )
        : ""
    }${select(
      "spec",
      "关联能力",
      [
        ["", "关联能力"],
        ["reading", "工程记录阅读"],
        ["previews", "原型与分享"],
        ["access", "身份与访问"],
      ],
      state.spec,
    )}${
      state.granularity === "tasks"
        ? select(
            "task-status",
            "任务状态",
            [
              ["", "所有任务状态"],
              ["todo", "待开始"],
              ["doing", "进行中"],
              ["done", "已完成"],
              ["blocked", "阻塞"],
            ],
            state.taskStatus || "",
          )
        : ""
    }${state.stage || state.size || state.wait || state.spec || state.taskStatus ? action("清除筛选", "clear-changes", "", "quiet") : ""}</div>`;
    content += `<div class="toolbar"><span class="small muted">${state.scope === "active" ? "当前进展" : "历史结果与记录"} · 只读</span>${segments("view", [["list", icon("list") + " 列表"], ...(state.scope === "active" || state.granularity === "tasks" ? [["board", icon("board") + " 看板"]] : []), ...(state.granularity === "changes" ? [["dependency", icon("network") + " 依赖"]] : [])], state.view)}</div>`;
    if (state.scene === "loading") return content + skeleton();
    const rows =
      state.scene === "empty" || state.scene === "no-match"
        ? []
        : changes.filter(
            (c) =>
              c.scope === state.scope &&
              (!state.stage || c.phase === state.stage) &&
              (!state.size || c.size === state.size) &&
              (!state.wait || c.waiting === state.wait) &&
              (!state.spec || c.spec === state.spec),
          );
    if (!rows.length)
      return (
        content +
        empty(
          state.scene === "empty" ? "暂无此类变更" : "没有匹配的变更",
          "可以切换范围，或清除当前筛选。",
          action("清除筛选", "clear-changes", "", "primary"),
        )
      );
    if (state.scene === "source-error")
      return (
        content +
        notice(
          "登记的工作分支无法读取。不会用协作分支的旧副本补出当前进度。",
          "error",
        )
      );
    if (state.granularity === "tasks") return content + tasksView(rows);
    if (state.view === "board")
      return (
        content +
        `<div class="board">${[
          ["requirement", "需求讨论"],
          ["execution", "正在执行"],
          ["close", "等待验收"],
        ]
          .map(
            ([phase, title]) =>
              `<section class="board-col"><h3>${title}</h3>${
                rows
                  .filter((c) => c.phase === phase)
                  .map(
                    (c) =>
                      `<button class="board-card" data-change="${c.id}"><strong>${c.title}</strong><div class="between">${badge(c.stage, c.tone)}<small class="muted">${c.size}</small></div></button>`,
                  )
                  .join("") || '<p class="small muted">暂无记录</p>'
              }</section>`,
          )
          .join("")}</div>`
      );
    if (state.view === "dependency")
      return (
        content +
        `<div class="dependency">${rows.map((c) => `${c.dependsOn?.length ? changeRow(changes.find((x) => x.id === "source-details")) + '<div class="dep-arrow">dependsOn · 依赖已归档交付</div>' : '<div class="section-caption">无前置依赖</div>'}${changeRow(c)}`).join("")}</div>`
      );
    const groups = [...new Set(rows.map((c) => c.group))];
    return (
      content +
      groups
        .map(
          (g) =>
            `${g ? `<div class="group-title">${icon("link")} ${g}</div>` : ""}<div class="change-list">${rows
              .filter((c) => c.group === g)
              .map(changeRow)
              .join("")}</div>`,
        )
        .join("") +
      `<div class="list-footer">阶段、等待与任务状态分别来自实际记录</div>`
    );
  }
  function changeRow(c) {
    return `<button class="change-row" data-change="${c.id}">${icon("change")}<span class="grow"><strong>${c.title}</strong><span class="change-meta"><span>${c.id}</span><span>${c.size}</span><span>${c.scope === "archived" ? "2026-10-18 归档" : c.scope === "cancelled" ? "方向调整后取消" : `任务 ${c.done} / ${c.total}`}</span></span></span>${badge(c.stage, c.tone)}${icon("chevron")}</button>`;
  }
  function taskEntries(c) {
    return Array.from({ length: c.total }, (_, i) => ({
      id: "T" + (i + 1),
      title: [
        "保留连续阅读的上下文",
        "完善列表与详情反馈",
        "验证设备与键盘路径",
        "整理验收依据",
      ][i],
      status:
        i < c.done
          ? "done"
          : !["execution", "close"].includes(c.phase)
            ? "todo"
            : c.waiting === "blocked"
              ? "blocked"
              : i === c.done
                ? "doing"
                : "todo",
      change: c.id,
    }));
  }
  function taskStatus(status) {
    return `<span class="task-status ${status}" aria-label="${{ done: "已完成", doing: "进行中", todo: "待开始", blocked: "阻塞" }[status]}">${status === "done" ? icon("check") : status === "blocked" ? "!" : status === "doing" ? "·" : ""}</span>`;
  }
  function tasksView(rows) {
    const entries = rows
      .flatMap(taskEntries)
      .filter((t) => !state.taskStatus || t.status === state.taskStatus);
    if (!entries.length)
      return empty(
        "没有匹配的任务",
        "试试其他任务状态。",
        action("清除筛选", "clear-changes", "", "primary"),
      );
    const card = (t) =>
      `<button class="${state.view === "board" ? "board-card" : "change-row"}" data-change="${t.change}" data-start-tab="tasks">${taskStatus(t.status)}<span class="grow"><strong>${t.id} · ${t.title}</strong><span class="change-meta">${t.change} · ${{ done: "已完成", doing: "进行中", todo: "待开始", blocked: "阻塞" }[t.status]}</span></span></button>`;
    return state.view === "board"
      ? `<div class="board">${["todo", "doing", "done", "blocked"]
          .map(
            (s) =>
              `<section class="board-col"><h3>${{ todo: "待开始", doing: "进行中", done: "已完成", blocked: "阻塞" }[s]}</h3>${
                entries
                  .filter((t) => t.status === s)
                  .map(card)
                  .join("") || '<p class="small muted">暂无任务</p>'
              }</section>`,
          )
          .join("")}</div>`
      : `<div class="change-list">${entries.map(card).join("")}</div>`;
  }
  function miniature(p, device = state.protoDevice) {
    return `<div class="mini-window ${device === "mobile" ? "phone" : device === "ipad" ? "tablet" : ""}" aria-hidden="true"><div class="mini-sidebar"><i></i><i></i><i></i><i></i></div><div class="mini-content"><b>${p.title}</b>${p.id === "workspace" ? Array.from({ length: 3 }, () => '<div class="mini-row"><span></span><i></i></div>').join("") : "<i></i><i></i><i></i><br><i></i><i></i><i></i><i></i>"}</div></div>`;
  }
  function prototypePage() {
    let content =
      head("原型", "把想法放进画面，一起看清细节。", "", "设计与交付") +
      sceneNotice();
    content += `<div class="toolbar">${segments(
      "kind",
      [
        ["all", "全部"],
        ["page", "页面"],
        ["component", "组件"],
      ],
      state.protoKind,
    )}${select(
      "proto-device",
      "适配设备",
      [
        ["all", "所有适配"],
        ["pc-web", "桌面"],
        ["ipad", "平板"],
        ["mobile", "手机"],
      ],
      state.protoDevice,
    )}</div>`;
    if (state.scene === "loading") return content + skeleton();
    if (state.scene === "empty" || state.scene === "no-match")
      return (
        content +
        empty(
          state.scene === "empty" ? "还没有原型" : "没有匹配的原型",
          "原型由项目发布并登记。你可以清除筛选，或稍后刷新查看。",
          action("清除筛选", "clear-prototypes", "", "primary"),
        )
      );
    const rows = prototypes.filter(
      (p) => state.protoKind === "all" || p.kind === state.protoKind,
    );
    return (
      content +
      `<div class="gallery">${rows
        .slice(0, state.protoLimit)
        .map(
          (p) =>
            `<article class="preview-card"><button class="preview-shot" data-preview="${p.id}" aria-label="预览${p.title}">${miniature(p)}<span class="open-preview">${icon("external")}</span></button><button class="card-detail" data-proto-detail="${p.id}" aria-label="查看${p.title}详情"><strong>${p.title}</strong><p>${p.description}</p><span class="between"><span>${p.kind === "page" ? "页面" : "组件"} · 桌面 / 平板 / 手机</span>${badge(state.scene === "unpublished" ? "未发布" : "固定版本", state.scene === "unpublished" ? "amber" : "")}</span></button></article>`,
        )
        .join(
          "",
        )}</div><div class="list-footer between"><span>截图打开预览 · 标题区域查看详情</span>${rows.length > state.protoLimit ? action("加载更多", "more-prototypes", "", "quiet") : ""}</div>`
    );
  }
  function fitCanvas() {
    const stage = $(".canvas-stage"),
      wrap = $(".canvas-wrap");
    if (!stage || !wrap) return;
    const dimensions = {
      "pc-web": [1440, 900],
      ipad: [834, 1194],
      mobile: [390, 844],
    }[state.device];
    let [width, height] = dimensions;
    if (state.landscape)
      [width, height] = [Math.max(width, height), Math.min(width, height)];
    const scale = state.zoom
      ? 1
      : Math.min(
          1,
          (wrap.clientWidth - 4) / width,
          Math.max(320, Math.min(650, innerHeight - 280)) / height,
        );
    stage.style.width = width * scale + "px";
    stage.style.height = height * scale + "px";
    const canvas = $(".demo-canvas", stage);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.style.transform = "scale(" + scale + ")";
  }
  function canvas() {
    const p = prototypes.find((p) => p.id === state.preview) || prototypes[0];
    return `<div class="canvas-stage"><div class="demo-canvas device-${state.device} ${state.landscape ? "landscape" : ""} ${state.zoom ? "zoom-actual" : ""}" aria-label="示例原型画布"><div class="demo-head">${icon("book")} ${p.title}<span class="grow"></span>${badge("示例原型")}</div><div class="demo-body"><span class="eyebrow">Atlas / 项目知识</span><h2>${p.id === "workspace" ? "找到项目的来处" : "专注于内容本身"}</h2><p>一个项目的规格、变化与设计，在同一个地方保持清晰。</p>${segments(
      "demo-section",
      [
        ["overview", "概览"],
        ["records", "工程记录"],
      ],
      state.demoSection,
    )}${state.demoSection === "overview" ? '<div class="doc-callout"><p>阅读的时候，工具退后一步。需要的时候，操作就在身边。</p></div><p>在上方切换视图，体验画布中的交互。这是独立的虚构内容，不读取实际工程数据。</p>' : '<table class="doc-table"><tbody><tr><td>Specs</td><td>当前能力与约定</td></tr><tr><td>Changes</td><td>讨论与交付依据</td></tr><tr><td>原型</td><td>固定版本预览</td></tr></tbody></table>'}</div></div></div>`;
  }
  function canvasTools(publicMode = false) {
    return `<div class="canvas-toolbar">${segments(
      "device",
      [
        ["pc-web", icon("monitor") + " 桌面"],
        ["ipad", "平板"],
        ["mobile", icon("phone") + " 手机"],
      ],
      state.device,
    )}<div class="row">${ib(state.landscape ? "切换竖向" : "切换横向", "rotate", "refresh")}${action(state.zoom ? "100%" : "适应", "zoom", "", "quiet")}${ib("重新加载原型", "reload-preview", "refresh")}${!publicMode ? action("分享", "share-prototype", "link", "quiet") : ""}</div></div>`;
  }
  function viewer() {
    const p = prototypes.find((p) => p.id === state.preview) || prototypes[0];
    let content =
      state.scene === "unpublished"
        ? empty(
            "这个原型尚未发布",
            "当前只有入口说明，没有可预览的固定产物。",
            action("返回总览", "go-prototypes", "", "primary"),
          )
        : state.scene === "loading"
          ? skeleton()
          : `${sceneNotice()}${canvasTools()}<div class="canvas-wrap">${canvas()}</div><p class="canvas-caption">${p.title} · ${state.device === "pc-web" ? "1440 × 900" : state.device === "ipad" ? "834 × 1194" : "390 × 844"} · ${state.zoom ? "100% 查看" : "适应画布"}${state.landscape ? " · 横向" : ""}</p>`;
    return `<div class="viewer"><aside class="viewer-nav"><div class="section-caption">项目原型</div>${prototypes.map((p) => `<button data-preview="${p.id}" class="${p.id === state.preview ? "active" : ""}">${p.title}</button>`).join("")}</aside><div class="viewer-body">${content}</div></div>`;
  }
  function publicPage() {
    const unavailable =
      state.scene === "revoked" || state.scene === "unpublished";
    return `<main id="main" class="public-shell" tabindex="-1"><header class="public-header between"><div class="brand"><img src="${brand}" alt="OpenFolio"><span>OpenFolio</span></div><div class="row"><span class="small muted">公开原型 · 固定版本</span>${ib(state.theme === "light" ? "切换深色主题" : "切换浅色主题", "theme", state.theme === "light" ? "moon" : "sun")}${action("复制链接", "copy-public", "link", "quiet")}</div></header><div class="public-title"><div class="eyebrow">Atlas · 设计预览</div><h1>${prototypes.find((p) => p.id === state.preview)?.title || "文档阅读工作面"}</h1><p class="small muted">这个链接始终指向同一个版本。</p></div><section class="viewer-body">${unavailable ? empty(state.scene === "revoked" ? "这个版本已撤回" : "没有找到这个公开版本", state.scene === "revoked" ? "发布方已撤回访问。请联系分享者获取新的预览。" : "该版本尚未准备或链接无效。请向分享者核对链接。", "", "lock") : state.scene === "loading" ? skeleton() : `${sceneNotice()}${canvasTools(true)}<div class="canvas-wrap">${canvas()}</div><p class="canvas-caption">无需登录即可查看此固定版本 · 不包含私有工程记录</p>`}</section></main>`;
  }
  function loginForm() {
    return `<form id="login-form"><div class="field"><label for="display-name">显示名称 <span class="muted">可选</span></label><input id="display-name" name="label" placeholder="例如：日常阅读" autocomplete="off" maxlength="100"><small>用于区分身份，不参与权限判断。</small></div><div class="field"><label for="demo-token">GitHub Token</label><input id="demo-token" name="token" type="password" placeholder="输入 demo 或 demo-other" autocomplete="off" required><small>交互原型只接受 <code>demo</code> / <code>demo-other</code>，请勿填写真实凭据。</small></div><p id="login-error" class="form-error" role="alert"></p><button class="btn primary" type="button" data-action="submit-login">${icon("arrow")}登录并发现仓库</button></form>`;
  }
  function loginPage() {
    return `<div class="login-panel"><div class="login-mark"><span class="symbol">${icon("lock")}</span></div><h1>登录自己的工作台</h1><p>使用 Token，找到你有权阅读的项目。相同 Token 可以恢复同一个工作台。</p>${loginForm()}<div class="subnote">${icon("eye")}<span>工程记录只读。访问范围由你的仓库权限决定。</span></div></div>`;
  }
  function credentials() {
    let content = head(
      "当前凭据",
      "每个 Token，一个独立的工作台。",
      action("添加身份", "login", "plus"),
      "身份与访问",
    );
    if (state.scene === "loading") return content + skeleton();
    if (state.scene === "expired")
      return (
        content +
        empty(
          "当前身份已失效",
          "请重新添加有效 Token，或选择其他已记住的身份。",
          action("重新登录", "login", "", "primary"),
        )
      );
    if (state.scene === "empty" || !state.remembered.length)
      return content + loginPage();
    content += sceneNotice();
    content += `<div class="settings-layout"><section class="settings-section"><h2>此浏览器的身份</h2><p>点选已记住的身份，无需再次输入 Token。</p>${state.remembered.map((t) => `<div class="identity-row"><span class="avatar">${t === "demo" ? "林" : "协"}</span><div class="stack grow"><strong>${esc(state.labels[t])} ${state.login && t === state.token ? badge("当前", "blue") : ""}</strong><span class="small muted">demo-lin · GitHub<br>${t === "demo" ? "个人项目与阅读记录" : "组织项目的独立工作台"}</span></div><div class="actions">${state.login && t === state.token ? "" : action("切换身份", "switch-token", "", "", `data-token="${t}"`)}${action("移除", "remove-token", "", "quiet", `data-token="${t}"`)}</div></div>`).join("")}</section>${state.login ? `<section class="settings-section"><div class="between"><div><h2>当前 Token</h2><p class="small muted">仅在你主动复制时显示示例值。</p></div>${action("复制 Token", "copy-token", "copy")}</div></section><section class="settings-section"><div class="between"><h2>已登录设备</h2>${badge("当前工作台")}</div><p>退出设备会同时移除它记住当前身份的授权。</p>${(state.devices[state.token] || []).map((d) => `<div class="identity-row"><span class="device-icon">${icon(d === "current" ? "monitor" : "phone")}</span><div class="stack grow"><strong>${d === "current" ? "Chrome · 此浏览器" : d === "phone" ? "Safari · iPhone" : "Safari · iPad"} ${d === "current" ? badge("当前设备") : ""}</strong><span class="small muted">最近使用：${d === "current" ? "刚刚" : d === "phone" ? "今天 09:40" : "昨天 18:20"}</span></div>${action(d === "current" ? "退出登录" : "退出设备", "revoke-device", "", "quiet", `data-device="${d}"`)}</div>`).join("")}<div class="dialog-actions">${action("退出全部设备", "logout-all", "", "danger")}</div></section>` : ""}</div>`;
    return content;
  }
  const dialogTriggers = new WeakMap();
  function rememberFocus() {
    const el = document.activeElement;
    return {
      el,
      action: el?.dataset?.action,
      token: el?.dataset?.token,
      change: el?.dataset?.change,
      preview: el?.dataset?.preview,
      doc: el?.dataset?.doc,
    };
  }
  function restoreFocus(s) {
    requestAnimationFrame(() => {
      if (s?.el?.isConnected) s.el.focus({ preventScroll: true });
      else {
        const selector = s?.change
          ? `[data-change="${s.change}"]`
          : s?.preview
            ? `[data-preview="${s.preview}"]`
            : s?.doc
              ? `[data-doc="${s.doc}"]`
              : s?.action
                ? `[data-action="${s.action}"]${s.token ? `[data-token="${s.token}"]` : ""}`
                : "#main";
        const modal = $$("dialog[open]").at(-1);
        (modal?.querySelector("button") || $(selector) || $("#main"))?.focus({
          preventScroll: true,
        });
      }
    });
  }
  function openDialog(id, title, body, wide = false) {
    const el = $(id);
    if (!el.open) dialogTriggers.set(el, rememberFocus());
    el.classList.toggle("reader-dialog", wide);
    el.innerHTML = `<header class="dialog-header"><h2 id="${el.id}-title">${title}</h2>${ib("关闭", "close", "close", `data-dialog="${el.id}"`)}</header><div class="dialog-body">${body}</div>`;
    if (!el.open) el.showModal();
  }
  function closeDialog(id) {
    const el = $(id);
    if (el?.open) el.close();
  }
  function openDetails(id, tab = "overview") {
    state.detail = id;
    state.tab = tab;
    const el = $("#detail");
    if (!el.open) dialogTriggers.set(el, rememberFocus());
    renderDetails();
    if (!el.open) el.showModal();
  }
  function renderDetails() {
    const c = changes.find((x) => x.id === state.detail) || changes[0],
      tabs = [
        ["overview", "概览"],
        ["tasks", "任务"],
        ["documents", "文档"],
        ["prototypes", "原型"],
        ["integration", "合入变更"],
        ["evidence", "依据"],
      ];
    $("#detail").classList.toggle("wide", state.tab === "integration");
    $("#detail").innerHTML =
      `<div class="detail-top"><div class="between"><span class="small muted row">${icon("change")}Change 详情</span><div class="row">${ib("复制变更链接", "share-change", "link")}${ib("关闭详情", "close", "close", 'data-dialog="detail"')}</div></div><h2 id="detail-title">${c.title}</h2><div class="row wrap">${badge(c.stage, c.tone)}<span class="mono muted">${c.id}</span>${badge(c.size)}</div></div><div class="detail-tabs" role="tablist" aria-label="变更详情">${tabs.map(([id, t]) => `<button role="tab" id="detail-tab-${id}" aria-selected="${state.tab === id}" aria-controls="detail-panel" tabindex="${state.tab === id ? "0" : "-1"}" class="${state.tab === id ? "active" : ""}" data-detail-tab="${id}">${t}</button>`).join("")}</div><div class="detail-content" role="tabpanel" id="detail-panel" aria-labelledby="detail-tab-${state.tab}">${detailContent(c)}</div>`;
  }
  function detailContent(c) {
    if (state.tab === "overview")
      return `<h3>目标</h3><p>${c.description}</p><dl class="facts"><dt>阅读来源</dt><dd>${c.scope === "archived" ? "develop" : "change/" + c.id}</dd><dt>${c.scope === "archived" ? "归档时间" : c.scope === "cancelled" ? "取消原因" : "当前等待"}</dt><dd>${c.scope === "archived" ? "2026-10-18 16:20" : c.scope === "cancelled" ? "方向调整，停止原布局探索" : c.waiting === "blocked" ? "任务阻塞：等待测试凭据恢复" : c.waiting === "confirmation" ? "等待用户明确确认" : "暂无等待事项"}</dd><dt>关联能力</dt><dd><button class="text-btn" data-open-doc="reading">工程记录阅读</button></dd></dl><h3>澄清问答</h3><div class="qa"><strong><span class="muted">Q1</span> · 阅读位置需要在不同设备间同步吗？</strong><div class="qa-answer"><p>保留当前产品边界：最近仓库与模块可以恢复，页面滚动位置按浏览器工作台隔离。</p></div></div><div class="qa"><strong><span class="muted">Q2</span> · 首次打开关联材料时，如何安排阅读空间？</strong><p>${badge("未回答", "amber")}</p></div><div class="qa"><strong><span class="muted">Q3</span> · 是否增加历史版本切换？</strong><p>${badge("已撤回")} 本次不增加历史浏览能力，保留问答供追溯。</p></div><h3>相关交付</h3><button class="material-row" data-related="source-details">${icon("link")}<span class="grow">按需查看记录来源</span>${badge("已归档", "green")}${icon("chevron")}</button>`;
    if (state.tab === "tasks")
      return `<h3>任务 · ${c.done} / ${c.total}</h3><p>任务状态来自记录，工作台只读展示。</p>${taskEntries(
        c,
      )
        .map(
          (t) =>
            `<div class="qa"><div class="row">${taskStatus(t.status)}<strong>${t.id} · ${t.title}</strong></div><p>${t.status === "done" ? "验证：目录、返回路径与键盘检查通过。" : t.status === "blocked" ? "阻塞：测试凭据暂不可用，恢复后继续验证。" : t.status === "doing" ? "进行中，尚未记录完成验证。" : "尚未开始。"}</p></div>`,
        )
        .join("")}`;
    if (state.tab === "documents")
      return `<h3>工程材料</h3><p>保留记录原文，缺失材料不以示例补全。</p>${["requirement.md", "technical.md", "plan.md", "execution.md", "review.md"].map((f, i) => `<button class="material-row" data-material="${f}" ${state.scene === "missing-material" && i > 0 ? "disabled" : ""}>${icon("file")}<span class="grow">${["需求", "技术方案", "实施计划", "执行记录", "评审记录"][i]}<br><span class="mono muted">${f}</span></span>${state.scene === "missing-material" && i > 0 ? badge("尚无材料") : icon("chevron")}</button>`).join("")}`;
    if (state.tab === "prototypes")
      return `<h3>本次固定原型</h3><p>这里保留 Change 当时的固定交付，不跟随项目当前清单更新。</p><button class="preview-shot" data-preview="reading" aria-label="打开固定原型">${miniature(prototypes[0])}</button><div class="dialog-actions">${action("查看详情", "fixed-proto-detail", "info")}${action("进入预览", "open-fixed-preview", "external", "primary")}</div>`;
    if (state.tab === "integration") {
      if (c.scope !== "archived")
        return empty(
          "暂无合入记录",
          "当前没有可定位的正式合入记录，不据此判断是否曾经合入。",
          "",
          "branch",
        );
      if (state.scene === "integration-error")
        return notice("合入关联存在异常，无法确定唯一的合并提交。", "error");
      const files = [
        "src/components/reading.tsx",
        "docs/project/archive/2026-10-18-source-details/requirement.md",
        "assets/preview.png",
        "src/large-example.ts",
      ];
      return `<div class="between wrap"><span class="small muted">合入 develop · 2026-10-18</span><span class="mono">a7b2c10 · 示例</span></div><p>完整合入差异，包含代码、文档和归档移动。</p><div class="diff-layout"><div class="file-list" aria-label="合入文件">${files.map((f, i) => `<button class="${state.file === i ? "active" : ""}" data-diff-file="${i}">${f}</button>`).join("")}</div><div class="diff-view"><div class="file-name">${files[state.file]}</div>${state.file === 2 ? empty("二进制文件", "此文件没有可展示的文本差异。", "", "file") : state.file === 3 ? empty("差异超过展示限制", "请在 Git 中比较这个固定合并提交。", action("复制比较命令", "copy-diff", "copy"), "file") : state.file === 1 ? `<pre>rename from docs/project/changes/source-details/requirement.md\nrename to docs/project/archive/2026-10-18-source-details/requirement.md\n\n文档内容未改变</pre>` : `<pre><span class="muted">@@ -18,4 +18,6 @@</span>\n 18  function ReadingSurface() {\n<span class="diff-remove">-19    return &lt;div&gt;{content}&lt;/div&gt;;</span>\n<span class="diff-add">+19    return (\n+20      &lt;article aria-label="文档正文"&gt;\n+21        {content}\n+22      &lt;/article&gt;\n+23    );</span>\n 24  }</pre>`}</div></div>`;
    }
    return `<h3>记录依据</h3><dl class="facts"><dt>集中入口</dt><dd>develop / docs/project/changes/${c.id}/change.json</dd><dt>完整记录</dt><dd>${c.scope === "archived" ? "develop" : "change/" + c.id} · b8e3a91（示例）</dd><dt>需求确认</dt><dd>${c.phase === "requirement" ? "尚未记录" : "目标与边界已有明确确认"}</dd><dt>技术 / 计划</dt><dd>${["execution", "close"].includes(c.phase) ? "按对应规模记录的确认" : "尚未记录"}</dd><dt>验收</dt><dd>${c.scope === "archived" ? "用户明确验收后归档" : "尚未记录用户验收"}</dd></dl><p>阶段位置、文档存在和任务完成，都不能替代实际确认与验收。</p>${action("查看入口 JSON", "raw-change", "file", "quiet")}`;
  }
  function prototypeDetail(id) {
    state.preview = id;
    const p = prototypes.find((p) => p.id === id);
    openDialog(
      "#overlay",
      p.title,
      `<p>${p.description}</p><div class="preview-shot">${miniature(p)}</div><dl class="facts"><dt>类型 / 适配</dt><dd>${p.kind === "page" ? "页面" : "组件"} · 桌面、平板、手机</dd><dt>源码</dt><dd>packages/prototype/src/${p.id}.html</dd><dt>源码提交</dt><dd>a7b2c10 · 示例</dd><dt>清单来源</dt><dd>develop · b8e3a91 · 示例</dd><dt>固定产物</dt><dd>${state.scene === "unpublished" ? "尚未发布" : "hosted / demo-fixed-01"}</dd></dl><div class="dialog-actions">${action("进入预览", "open-fixed-preview", "external", "primary")}</div>`,
    );
  }
  async function copyText(value, label) {
    if (state.scene !== "copy-error") {
      try {
        if (
          !navigator.clipboard ||
          (document.permissionsPolicy || document.featurePolicy)?.allowsFeature(
            "clipboard-write",
          ) === false
        )
          throw Error("clipboard unavailable");
        await navigator.clipboard.writeText(value);
        toast(label + "已复制");
        return;
      } catch {}
    }
    openDialog(
      "#overlay",
      "手动复制" + label,
      `<p>浏览器未允许自动复制。选中下面的内容，手动复制即可。</p><div class="field"><label for="copy-value">${label}</label><textarea id="copy-value" readonly>${esc(value)}</textarea></div><div class="dialog-actions">${action("完成", "close", "", "primary", 'data-dialog="overlay"')}</div>`,
    );
    $("#copy-value").select();
  }
  function sourceDialog() {
    openDialog(
      "#overlay",
      "读取来源",
      `<p>正文与状态来自同一次明确的读取。</p><dl class="facts"><dt>仓库</dt><dd>${repo().path}</dd><dt>协作分支</dt><dd>develop</dd><dt>提交</dt><dd>b8e3a91 · 示例快照</dd><dt>读取时间</dt><dd>2026-10-20 09:30</dd><dt>当前状态</dt><dd>${state.scene === "offline" ? "离线，尚未更新" : "已读取"}</dd></dl><p>以上均为虚构数据，不连接真实仓库。</p>`,
    );
  }
  function reviewDialog() {
    openDialog(
      "#overlay",
      "原型评审设置",
      `<p class="review-hint">这些控件只用于设计验收，不属于产品功能。数据和操作仅保存在当前页面内存中。</p><div class="review-form"><label>主题<select class="filter-select" id="review-theme"><option value="light" ${state.theme === "light" ? "selected" : ""}>浅色</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>深色</option></select></label><label>表面材质<select class="filter-select" id="review-material"><option value="glass" ${state.material === "glass" ? "selected" : ""}>局部玻璃</option><option value="solid" ${state.material === "solid" ? "selected" : ""}>不透明 / 不支持模糊</option></select></label><label>减少动态效果<input type="checkbox" id="review-motion" ${state.motion === "reduce" ? "checked" : ""}></label></div><p class="review-hint">系统开启减少透明度或减少动态效果时，始终优先遵循系统设置。</p><div class="dialog-actions">${action("重置演示", "reset-demo", "", "quiet")}${action("应用", "apply-review", "", "primary")}</div>`,
    );
  }
  function confirmDialog(title, description, doAction, extra = "") {
    openDialog(
      "#overlay",
      title,
      `<p>${description}</p><div class="dialog-actions">${action("取消", "close", "", "", 'data-dialog="overlay"')}${action("确认" + title, doAction, "", "danger", extra)}</div>`,
    );
  }
  function removeIdentity(token) {
    state.remembered = state.remembered.filter((t) => t !== token);
    state.devices[token] = state.devices[token].filter((d) => d !== "current");
    if (token === state.token) state.login = false;
  }
  const actions = {
    "submit-login": (el) => submitForm(el.closest("form")),
    "submit-repository": (el) => submitForm(el.closest("form")),
    "open-atlas": () => {
      state.repo = "atlas";
      closeDialog("#overlay");
      go("specs");
    },
    "go-home": () => {
      closeDialog("#overlay");
      state.scene = "normal";
      go("home");
    },
    "go-credentials": () => go("credentials"),
    "go-changes": () => go("changes"),
    "go-prototypes": () => go("prototypes"),
    theme: () => {
      state.theme = state.theme === "light" ? "dark" : "light";
      render();
    },
    collapse: () => {
      state.collapsed = !state.collapsed;
      render();
    },
    source: sourceDialog,
    review: reviewDialog,
    close: (el) => closeDialog("#" + (el.dataset.dialog || "overlay")),
    "apply-review": () => {
      state.theme = $("#review-theme").value;
      state.material = $("#review-material").value;
      state.motion = $("#review-motion").checked ? "reduce" : "normal";
      closeDialog("#overlay");
      render();
      toast("已应用评审设置");
    },
    "reset-demo": () => {
      closeDialog("#overlay");
      state.login = true;
      state.remembered = ["demo", "demo-other"];
      state.token = "demo";
      state.devices = {
        demo: ["current", "phone", "tablet"],
        "demo-other": ["current", "phone"],
      };
      state.scene = "normal";
      state.repoFilter = "all";
      state.scope = "active";
      state.view = "list";
      render();
      toast("已重置示例状态");
    },
    recover: () => {
      state.scene = "normal";
      render();
      toast("已恢复示例内容");
    },
    refresh: () => {
      state.scene = "loading";
      render();
      setTimeout(() => {
        state.scene = "normal";
        render();
        toast("已读取最新示例记录");
      }, 550);
    },
    discover: () => {
      state.scene = "loading";
      render();
      setTimeout(() => {
        state.scene = "normal";
        state.repoFilter = "all";
        render();
        toast("仓库发现完成 · 示例操作");
      }, 650);
    },
    "more-repos": () => {
      state.repoLimit = 20;
      render();
    },
    "clear-repos": () => {
      state.repoFilter = "all";
      state.scene = "normal";
      render();
    },
    "clear-changes": () => {
      state.stage = "";
      state.size = "";
      state.wait = "";
      state.spec = "";
      state.taskStatus = "";
      state.scene = "normal";
      render();
    },
    "clear-prototypes": () => {
      state.protoKind = "all";
      state.protoDevice = "all";
      state.scene = "normal";
      render();
    },
    "more-prototypes": () => {
      state.protoLimit = 20;
      render();
    },
    "pick-repo": () =>
      openDialog(
        "#overlay",
        "选择项目",
        availableRepos()
          .filter((r) => r.status === "ready")
          .map(
            (r) =>
              `<button class="picker-row" data-pick-repo="${r.id}"><span class="symbol ${r.color}">${r.symbol}</span><span class="stack grow"><strong>${r.name}</strong><small>${r.path}</small></span>${state.repo === r.id ? icon("check") : ""}</button>`,
          )
          .join(""),
      ),
    "check-repo": () =>
      openDialog(
        "#overlay",
        "检查仓库",
        `<p>用 HTTPS 仓库地址核对接入状态。此处只处理虚构示例。</p><form id="repository-form"><div class="field"><label for="repository-url">GitHub 仓库地址</label><input id="repository-url" type="url" required placeholder="https://github.com/demo-lab/design-kit"><small>示例：demo-lab/design-kit（需要关注）或 demo-studio/atlas（可阅读）。</small></div><div class="field"><label for="repository-branch">协作分支</label><input id="repository-branch" value="develop" required></div><p class="form-error" id="repository-error" role="alert"></p><div class="dialog-actions"><button class="btn primary" type="button" data-action="submit-repository">检查仓库</button></div></form>`,
      ),
    directory: () => openDialog("#overlay", "能力目录", directory()),
    "tree-toggle": (el) => {
      const open = el.getAttribute("aria-expanded") === "true";
      el.setAttribute("aria-expanded", String(!open));
      el.nextElementSibling.hidden = open;
    },
    raw: () =>
      openDialog(
        "#overlay",
        "文档原文",
        `<pre class="raw"># ${esc(docs.find(([id]) => id === state.doc)[1])}\n\n工程记录来自中心仓库的已推送内容。\n\n## 能力与边界\n\n工作台只读呈现 Specs、Changes 和原型。\n\n## 阅读来源\n\n协作分支：develop\n</pre>`,
      ),
    "share-doc": () =>
      copyText(
        location.href.split("#")[0] + href("specs", { doc: state.doc }),
        "阅读链接",
      ),
    "share-change": () =>
      copyText(
        location.href.split("#")[0] + href("changes", { change: state.detail }),
        "变更链接",
      ),
    "view-image": () =>
      openDialog(
        "#reader",
        "仓库图片",
        `<img src="${brand}" alt="示例项目标记" style="width:180px;margin:30px auto"><p>来自同一示例快照的仓库图片。</p>`,
        true,
      ),
    "raw-change": () =>
      openDialog(
        "#overlay",
        "入口 JSON",
        `<pre class="raw">${esc(JSON.stringify({ id: state.detail, branch: "change/" + state.detail, status: "active" }, null, 2))}</pre>`,
      ),
    "copy-diff": () => copyText("git diff a7b2c10^1 a7b2c10", "Git 比较命令"),
    "fixed-proto-detail": () => prototypeDetail("reading"),
    "open-fixed-preview": () => {
      closeDialog("#overlay");
      closeDialog("#detail");
      go("viewer", { preview: state.preview });
    },
    "share-prototype": () => {
      if (state.scene === "unpublished") {
        toast("尚未发布，无法准备公开版本");
        return;
      }
      openDialog(
        "#overlay",
        "准备公开原型",
        `<p>为当前原型准备固定的公开版本。链接只展示原型，不包含私有文档、身份或 Token。</p><p class="small">此操作在原型中模拟，不会发布真实工程资料。</p><div class="dialog-actions">${action("取消", "close", "", "", 'data-dialog="overlay"')}${action("准备固定版本", "prepare-public", "external", "primary")}</div>`,
      );
    },
    "prepare-public": () => {
      openDialog(
        "#overlay",
        "固定版本已准备",
        `<p>这个示例链接不会随当前目录变化。</p><div class="field"><label for="publication-link">固定预览链接</label><textarea id="publication-link" readonly>${esc(location.href.split("#")[0] + href("public", { preview: state.preview }))}</textarea></div><div class="dialog-actions">${action("复制链接", "copy-public", "copy")}${action("打开公开预览", "open-public", "external", "primary")}</div>`,
      );
    },
    "open-public": () => {
      closeDialog("#overlay");
      go("public", { preview: state.preview });
    },
    "copy-public": () =>
      copyText(
        location.href.split("#")[0] +
          href("public", { preview: state.preview }),
        "公开预览链接",
      ),
    rotate: () => {
      state.landscape = !state.landscape;
      render();
    },
    zoom: () => {
      state.zoom = !state.zoom;
      render();
    },
    "reload-preview": () => {
      state.demoSection = "overview";
      render();
      toast("原型已重新加载");
    },
    login: () =>
      openDialog(
        "#overlay",
        state.login ? "添加身份" : "登录工作台",
        `<p>只接受示例 Token：demo / demo-other。</p>${loginForm()}`,
      ),
    "switch-token": (el) => {
      if (["switch-error", "offline", "error"].includes(state.scene)) {
        openDialog(
          "#overlay",
          "暂时无法切换身份",
          "<p>示例网络验证失败，当前身份和已记住的授权均已保留。请稍后重试。</p>",
        );
        return;
      }
      switchWorkspace(el.dataset.token);
      state.login = true;
      state.scene = "normal";
      render();
      toast("已切换到" + state.labels[state.token]);
    },
    "remove-token": (el) =>
      confirmDialog(
        "移除身份",
        `仅移除此浏览器记住的“${esc(state.labels[el.dataset.token])}”。其他设备和工作台资料保留。`,
        "confirm-remove",
        `data-token="${el.dataset.token}"`,
      ),
    "confirm-remove": (el) => {
      removeIdentity(el.dataset.token);
      closeDialog("#overlay");
      render();
      toast("已移除本浏览器身份");
    },
    "copy-token": () => copyText(state.token, "示例 Token"),
    "revoke-device": (el) =>
      confirmDialog(
        el.dataset.device === "current" ? "退出登录" : "退出设备",
        "撤销这台设备对当前 Token 工作台的授权。其他身份不受影响。",
        "confirm-revoke",
        `data-device="${el.dataset.device}"`,
      ),
    "confirm-revoke": (el) => {
      const d = el.dataset.device;
      state.devices[state.token] = state.devices[state.token].filter(
        (x) => x !== d,
      );
      if (d === "current") removeIdentity(state.token);
      closeDialog("#overlay");
      render();
      toast("设备授权已撤销 · 示例操作");
    },
    "logout-all": () =>
      confirmDialog(
        "退出全部设备",
        "仅退出当前 Token 工作台的所有设备，其他 Token 身份保留。",
        "confirm-logout-all",
      ),
    "confirm-logout-all": () => {
      state.devices[state.token] = [];
      removeIdentity(state.token);
      closeDialog("#overlay");
      render();
      toast("当前工作台的所有设备已退出");
    },
  };
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button,a");
    if (!target) return;
    if (target.classList.contains("skip-link")) {
      event.preventDefault();
      $("#main")?.focus();
      return;
    }
    if (target.dataset.action) {
      event.preventDefault();
      if (
        state.scene === "offline" &&
        [
          "confirm-remove",
          "confirm-revoke",
          "confirm-logout-all",
          "prepare-public",
        ].includes(target.dataset.action)
      ) {
        openDialog(
          "#overlay",
          "操作未完成",
          "<p>当前离线，未更改授权或公开版本。恢复连接后重试。</p>",
        );
        return;
      }
      actions[target.dataset.action]?.(target);
      return;
    }
    if (target.dataset.route) {
      event.preventDefault();
      go(target.dataset.route);
      return;
    }
    if (target.dataset.repo) {
      event.preventDefault();
      const r = repos.find((r) => r.id === target.dataset.repo);
      if (r.status === "attention") {
        openDialog(
          "#overlay",
          "项目需要关注",
          '<p>协作分支中的配置与声明不一致。请在仓库完成 SpecTrail Setup，然后重新检查。</p><div class="dialog-actions">' +
            action("重新检查", "check-repo", "refresh", "primary") +
            "</div>",
        );
        return;
      }
      state.repo = r.id;
      state.doc = "overview";
      go("specs");
      return;
    }
    if (target.dataset.pickRepo) {
      state.repo = target.dataset.pickRepo;
      state.doc = "overview";
      state.scope = "active";
      state.stage = "";
      state.size = "";
      state.wait = "";
      state.spec = "";
      state.taskStatus = "";
      state.protoKind = "all";
      state.protoDevice = "all";
      state.scroll = {};
      closeDialog("#overlay");
      go(["home", "credentials"].includes(state.route) ? "specs" : state.route);
      return;
    }
    if (target.dataset.doc) {
      state.doc = target.dataset.doc;
      closeDialog("#overlay");
      go("specs", { doc: state.doc });
      return;
    }
    if (target.dataset.anchor) {
      event.preventDefault();
      closeDialog("#overlay");
      $("#" + target.dataset.anchor)?.scrollIntoView({
        behavior: state.motion === "reduce" ? "instant" : "smooth",
      });
      return;
    }
    if (target.dataset.openDoc) {
      openDialog(
        "#reader",
        "关联文档",
        `<article class="document">${documentBody()}</article>`,
        true,
      );
      return;
    }
    if (target.dataset.change) {
      openDetails(target.dataset.change, target.dataset.startTab || "overview");
      return;
    }
    if (target.dataset.related) {
      openDetails(target.dataset.related);
      return;
    }
    if (target.dataset.detailTab) {
      state.tab = target.dataset.detailTab;
      renderDetails();
      $("#detail-tab-" + state.tab)?.focus();
      return;
    }
    if (target.dataset.diffFile) {
      state.file = Number(target.dataset.diffFile);
      renderDetails();
      $(`[data-diff-file="${state.file}"]`)?.focus();
      return;
    }
    if (target.dataset.material) {
      openDialog(
        "#reader",
        target.dataset.material,
        `<article class="document"><span class="doc-label">示例工程材料 · 只读</span><h1>${{ "requirement.md": "阅读体验的目标", "technical.md": "阅读上下文方案", "plan.md": "交付与验证顺序", "execution.md": "执行验证依据", "review.md": "评审与复验" }[target.dataset.material]}</h1><p>这份材料属于虚构 Change，用于验收文档阅读布局。它不是本次前端重构的技术方案或实施计划。</p><h2>内容与边界</h2><p>保留既有读取能力、权限与来源，展示真实记录中的目标、决定和验证证据。</p></article>`,
        true,
      );
      return;
    }
    if (target.dataset.preview) {
      if (state.scene === "unpublished") {
        toast("这个入口尚未发布");
        return;
      }
      state.preview = target.dataset.preview;
      closeDialog("#detail");
      go("viewer", { preview: state.preview });
      return;
    }
    if (target.dataset.protoDetail) {
      prototypeDetail(target.dataset.protoDetail);
      return;
    }
    if (target.dataset.select) {
      const group = target.dataset.select,
        value = target.dataset.value;
      const key = {
        "repo-filter": "repoFilter",
        scope: "scope",
        view: "view",
        granularity: "granularity",
        kind: "protoKind",
        device: "device",
        "demo-section": "demoSection",
      }[group];
      if (key) state[key] = value;
      if (group === "scope") {
        state.stage = "";
        state.wait = "";
        state.view = "list";
      }
      if (group === "granularity") state.view = "list";
      render();
      $(`[data-select="${group}"][data-value="${value}"]`)?.focus({
        preventScroll: true,
      });
    }
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.id === "review-page") {
      go(el.value);
      return;
    }
    if (el.id === "review-scene") {
      state.scene = el.value;
      render();
      $("#review-scene")?.focus();
      return;
    }
    if (el.dataset.filter) {
      const key =
        { "proto-device": "protoDevice", "task-status": "taskStatus" }[
          el.dataset.filter
        ] || el.dataset.filter;
      state[key] = el.value;
      render();
      $(`[data-filter="${el.dataset.filter}"]`)?.focus();
    }
  });
  function submitForm(form) {
    if (!form.reportValidity()) return;
    if (form.id === "login-form") {
      if (["offline", "error"].includes(state.scene)) {
        form.querySelector(".form-error").textContent =
          "当前网络不可用，未更改登录或身份。请恢复连接后重试。";
        return;
      }
      const data = new FormData(form),
        token = String(data.get("token")).trim(),
        label = String(data.get("label")).trim();
      if (!["demo", "demo-other"].includes(token)) {
        form.querySelector(".form-error").textContent =
          "这里只接受 demo 或 demo-other，请勿使用真实 Token。";
        return;
      }
      if (label) state.labels[token] = label;
      if (!state.remembered.includes(token)) state.remembered.push(token);
      if (!state.devices[token].includes("current"))
        state.devices[token].push("current");
      switchWorkspace(token);
      state.login = true;
      state.scene = "normal";
      closeDialog("#overlay");
      go("home");
      toast("已恢复示例工作台");
    }
    if (form.id === "repository-form") {
      const url = form.querySelector("#repository-url").value.trim(),
        branch = form.querySelector("#repository-branch").value.trim();
      if (
        !/^https:\/\/github\.com\/(demo-lab\/design-kit|demo-studio\/atlas)\/?$/.test(
          url,
        )
      ) {
        form.querySelector(".form-error").textContent =
          "请使用提示中的虚构示例地址。不会检查真实仓库。";
        return;
      }
      const ready = url.includes("atlas") && branch === "develop";
      openDialog(
        "#overlay",
        ready ? "仓库可阅读" : "需要关注",
        `<p>${ready ? "已在 develop 发现有效的 SpecTrail 配置。" : "协作分支配置需要核对。请先在仓库完成 Setup，再返回重新检查。"}</p><div class="dialog-actions">${ready ? action("进入项目", "open-atlas", "", "primary") : action("重新检查", "check-repo", "refresh")}</div>`,
      );
    }
  }
  document.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(event.target);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      event.target.matches("input") &&
      event.target.closest("form")
    ) {
      event.preventDefault();
      submitForm(event.target.closest("form"));
      return;
    }
    const tab = event.target.closest('[role="tab"]');
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tabs = $$('[role="tab"]', tab.parentElement),
        index = tabs.indexOf(tab);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].click();
    }
  });
  $$("dialog").forEach((d) => {
    d.addEventListener("close", () => restoreFocus(dialogTriggers.get(d)));
    d.addEventListener("click", (event) => {
      if (event.target === d) {
        const b = d.getBoundingClientRect();
        if (
          event.clientX < b.left ||
          event.clientX > b.right ||
          event.clientY < b.top ||
          event.clientY > b.bottom
        )
          d.close();
      }
    });
  });
  addEventListener("hashchange", () => {
    applyHash();
    render();
    restoreScroll();
    const { params } = routeParams();
    if (params.has("change") && state.route === "changes")
      openDetails(state.detail);
  });
  addEventListener("resize", fitCanvas);
  mqMotion.addEventListener("change", () => render());
  mqTransparency.addEventListener("change", () => render());
  render();
  const { params } = routeParams();
  if (params.has("change") && state.route === "changes")
    openDetails(state.detail);
})();
