const $ = (selector, root = document) => root.querySelector(selector);
const mark = "{{data:../assets/mark.png}}";
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  scenario: "home",
  filter: "all",
  query: "",
  connected: true,
  accounts: 2,
  accountNames: ["demo-user", "another-user"],
  pendingRemove: null,
};
const repos = [
  {
    id: "open-folio",
    name: "OpenFolio",
    path: "demo-user / open-folio",
    description: "从仓库里的工程记录，找到项目的当前进展。",
    symbol: "O",
    tone: "",
    specs: 6,
    changes: 1,
    prototypes: 1,
  },
  {
    id: "spec-trail",
    name: "SpecTrail",
    path: "demo-user / spec-trail",
    description: "把需求、方案和验收留在同一条协作路径上。",
    symbol: "S",
    tone: "lilac",
    specs: 4,
    changes: 2,
    prototypes: 0,
  },
  {
    id: "docs-kit",
    name: "Docs Kit",
    path: "example-team / docs-kit",
    description: "团队文档与组件说明。",
    symbol: "D",
    tone: "sage",
    specs: 3,
    changes: 0,
    prototypes: 1,
  },
];
let toastTimer, scanTimer, dialogTrigger;
const go = (route) => {
  if (location.hash === "#" + route) render();
  else location.hash = route;
};
function toast(message) {
  clearTimeout(toastTimer);
  $(".toast").textContent = message;
  toastTimer = setTimeout(() => ($(".toast").textContent = ""), 3000);
}
function current() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return {
    page: parts[0] || "home",
    repo: parts[1] || "open-folio",
    tab: parts[2] || "specs",
    doc: parts[3] || "overview",
  };
}
function badge(text, tone = "success") {
  return `<span class="badge ${tone}"><span class="dot"></span>${text}</span>`;
}
function button(text, action, primary = false, svg = "") {
  return `<button class="btn ${primary ? "primary" : ""}" data-action="${action}">${svg ? icon(svg) : ""}${text}</button>`;
}
function setScenario(value) {
  clearTimeout(scanTimer);
  state.scenario = value;
  state.query = "";
  state.filter = "all";
  state.connected = value !== "welcome";
  state.accounts = 2;
  state.accountNames = ["demo-user", "another-user"];
  $("#scenario").value = value;
  go(
    value === "welcome"
      ? "welcome"
      : value === "public"
        ? "public"
        : value === "denied"
          ? "denied"
          : "home",
  );
}
$("#scenario").addEventListener("change", (e) => setScenario(e.target.value));
function availableRepos() {
  return repos.filter(
    (r, i) =>
      state.scenario !== "empty" &&
      state.accountNames.includes(i < 2 ? "demo-user" : "another-user") &&
      (state.scenario !== "expired" || i === 2) &&
      (state.scenario !== "scanning" || i < 2),
  );
}
function shell(content, title = "我的仓库") {
  const route = current(),
    settings = route.page === "connections",
    repo = route.page === "repo";
  return `<div class="shell"><aside class="sidebar"><a class="brand" href="#home"><img src="${mark}" alt="">OpenFolio</a><a class="nav-link ${!settings ? "active" : ""}" href="#home" ${!settings ? 'aria-current="page"' : ""}>${icon("prototypes")}<span>我的仓库</span><span class="count">${availableRepos().length}</span></a><div class="nav-section">仓库</div>${availableRepos()
    .map(
      (r) =>
        `<a class="repo-nav" href="#repo/${r.id}/specs"><span>${r.symbol}</span>${r.name}</a>`,
    )
    .join(
      "",
    )}<div class="side-footer"><div class="connection-mini">${state.scenario === "expired" ? '<strong style="color:var(--red)">一个连接需要更新</strong>' : `<strong>● ${state.accounts} 个 GitHub 连接</strong>`}<br>仓库权限跟随你的账号</div><a class="nav-link ${settings ? "active" : ""}" href="#connections" ${settings ? 'aria-current="page"' : ""}>${icon("settings")}我的连接</a></div></aside><main class="work-area"><header class="topbar"><div class="breadcrumb"><img class="mobile-brand" src="${mark}" alt="OpenFolio"><span class="desktop-label">个人工作台</span>${icon("chevron")}<b>${esc(title)}</b></div><div class="row"><span class="small muted desktop-label">${repo ? "已推送的工程记录" : "你的仓库，你的工作台"}</span><a class="avatar" href="#connections" aria-label="管理个人连接">DE</a></div></header><div class="body">${content}</div></main></div><nav class="mobile-nav" aria-label="个人导航"><a href="#home" class="${!settings ? "active" : ""}">${icon("prototypes")}我的仓库</a><a href="#connections" class="${settings ? "active" : ""}">${icon("settings")}我的连接</a></nav>`;
}
function welcome() {
  return `<main class="welcome" style="min-height:calc(100dvh - 36px)"><div class="welcome-inner"><div class="welcome-mark"><img src="${mark}" alt="">OpenFolio</div><div class="eyebrow">从你参与的仓库开始</div><h1>项目的来龙去脉，<br>回到你的工作台。</h1><p>连接 GitHub，自动找到已接入 SpecTrail 的仓库。<br>需求、方案和原型，在同一个地方继续。</p>${button("连接 GitHub", "connect", true, "branch")}<div class="welcome-route"><span>连接自己的账号</span>${icon("chevron")}<span>发现仓库</span>${icon("chevron")}<span>开始阅读</span></div><p class="welcome-bottom">使用个人访问令牌连接，只需仓库读取权限。<br>协作者用自己的账号查看同一仓库，无需邀请码。</p><a class="text-link small" style="display:inline-block;margin-top:23px" href="#public">查看公开原型示例 ↗</a></div></main>`;
}
function notice() {
  if (state.scenario === "expired")
    return `<div class="notice danger"><div><strong>demo-user 的 GitHub 连接已失效</strong><p>更新 token 后可重新发现和读取仓库。其他连接仍可使用。</p></div>${button("更新 token", "replace")}</div>`;
  if (state.scenario === "partial")
    return `<div class="notice warning"><div><strong>部分仓库尚未完成检查</strong><p>GitHub 暂时限制了请求。已完成检查的仓库可继续阅读。</p></div>${button("重试检查", "rescan")}</div>`;
  if (state.scenario === "scanning")
    return `<div class="notice"><div style="flex:1"><strong>正在发现已接入 SpecTrail 的仓库</strong><p>已检查 8 / 12 个仓库 · 已发现 2 个 · 你可以先开始阅读</p><div class="progress"><span></span></div></div>${button("完成演示", "finish-scan")}</div>`;
  return "";
}
function repoRow(r) {
  return `<a class="repo-row" href="#repo/${r.id}/specs"><div class="row"><span class="repo-symbol ${r.tone}">${r.symbol}</span><div><div class="repo-name"><strong>${r.name}</strong></div><div class="repo-meta mono">${r.path}</div><div class="repo-description">${r.description}</div></div></div><div class="repo-content"><strong>${r.specs}</strong> Specs <span style="padding:0 5px">·</span><strong>${r.changes}</strong> 进行中<br>${r.prototypes} 个公开原型</div>${badge("已接入")}${icon("chevron")}</a>`;
}
function home() {
  let selected = availableRepos().filter(
    (r) =>
      (state.filter !== "mine" || r.path.startsWith("demo-user")) &&
      (!state.query ||
        (r.name + " " + r.path)
          .toLowerCase()
          .includes(state.query.toLowerCase())),
  );
  const empty =
    state.scenario === "empty"
      ? `<div class="empty">${icon("branch")}<h2>还没有发现 SpecTrail 仓库</h2><p>GitHub 已连接。确认 token 包含目标仓库，并已将 SpecTrail 配置推送到默认分支。</p><div class="row">${button("重新发现", "rescan", true)}${button("检查仓库地址", "check")}</div></div>`
      : !selected.length
        ? `<div class="empty">${icon("search")}<h2>没有匹配的仓库</h2><p>试试仓库名称或所属账号。</p>${button("清除搜索", "clear-search")}</div>`
        : "";
  return shell(
    `<section class="home"><div class="intro"><div><div class="eyebrow">MY REPOSITORIES</div><h1>我的仓库</h1><p>你参与的项目，和每一次有迹可循的推进。</p></div>${button("重新发现", "rescan", false, "refresh")}</div>${notice()}<div class="toolbar"><div class="filter-tabs" aria-label="仓库筛选"><button data-filter="all" class="${state.filter === "all" ? "active" : ""}" aria-pressed="${state.filter === "all"}">全部仓库</button><button data-filter="mine" class="${state.filter === "mine" ? "active" : ""}" aria-pressed="${state.filter === "mine"}">我的仓库</button></div><label class="search">${icon("search")}<input id="repo-search" type="search" aria-label="查找仓库" placeholder="查找仓库…" value="${esc(state.query)}"></label></div><div class="list-head"><span>仓库</span><span class="repo-content">工程记录</span><span>SpecTrail</span><span></span></div><div id="repo-results">${selected.map(repoRow).join("")}${empty}</div><div class="section-note"><span>${state.scenario === "scanning" ? "发现仍在进行中" : state.scenario === "partial" ? "上次发现部分完成" : state.scenario === "empty" ? "已检查 12 个仓库，暂无接入" : "发现完成 · 3 个已接入仓库"}<br>只显示当前连接有权读取的仓库</span><button data-action="check">找不到仓库？</button></div><div class="reading-corner"><div class="note-panel"><h3>协作，已经在仓库里</h3><p>分享一份 Spec 或 Change，对方用自己的 GitHub 账号继续阅读。无需再维护一份成员名单。</p><a href="#repo/open-folio/specs" class="text-link">打开项目知识 ${icon("chevron")}</a></div><div class="note-panel"><h3>让原型更容易被看见</h3><p>原型链接可以公开打开。让没有仓库账号的伙伴，也能直接体验这次改动。</p><a href="#public" class="text-link">查看公开预览 ${icon("chevron")}</a></div></div></section>`,
  );
}
function connections() {
  return shell(
    `<section class="connections"><div class="intro"><div><div class="eyebrow">CONNECTIONS</div><h1>我的连接</h1><p>用你自己的 GitHub 账号，读取你参与的仓库。</p></div>${button("连接 GitHub", "connect", true)}</div>${state.accountNames.map((account, i) => `<article class="connection-card"><div class="connection-detail"><div class="row"><span class="repo-symbol">GH</span><div><h3>${account}</h3><div class="repo-meta">GitHub · github.com</div></div></div>${badge(account === "demo-user" && state.scenario === "expired" ? "需要更新" : "已连接", account === "demo-user" && state.scenario === "expired" ? "danger" : "success")}</div><p>${account === "demo-user" && state.scenario === "expired" ? "无法验证当前 token，请更新后继续。" : "个人访问令牌已保存，原值不会再次显示。"}</p><div class="connection-actions">${button("替换 token", "replace")}${button("重新发现", "rescan")}<button class="btn quiet" data-action="remove" data-index="${i}">移除连接</button></div></article>`).join("")}<p class="connection-tip">连接只影响当前个人工作台。移除连接不会修改 GitHub 权限或仓库内容，已经发布的原型仍可公开访问。</p><button class="btn quiet danger" style="margin-top:18px" data-action="logout">退出当前工作台</button></section>`,
    "我的连接",
  );
}
const docs = {
  overview: [
    "项目知识工作台",
    "OpenFolio 从中心 Git 仓库的已推送记录提供 Spec 阅读、Change 追踪与原型浏览。工程记录由 SpecTrail 维护，工作台负责把上下文呈现在一起。",
  ],
  access: [
    "项目访问与分享",
    "工程记录跟随你的仓库读取权限。协作者使用各自的 GitHub 连接查看同一份已推送记录；原型预览可以公开分享。",
  ],
  workflow: [
    "Change 协作流程",
    "从明确需求开始，将技术取舍、任务执行和验收依据留在仓库中。每一个 Change 都有可以追溯的来源。",
  ],
};
function repository() {
  const c = current();
  if (!availableRepos().some((r) => r.id === c.repo)) return denied();
  const r = repos.find((r) => r.id === c.repo) || repos[0],
    d = docs[c.doc] || docs.overview;
  const tabs = `<nav class="tabs" aria-label="仓库内容">${[
    ["specs", "Specs"],
    ["changes", "Changes"],
    ["prototypes", "原型"],
  ]
    .map(
      ([id, label]) =>
        `<a href="#repo/${r.id}/${id}" class="${c.tab === id ? "active" : ""}" ${c.tab === id ? 'aria-current="page"' : ""}>${icon(id)}${label}</a>`,
    )
    .join("")}</nav>`;
  let content;
  if (c.tab === "changes")
    content = `<section class="change-list"><article class="change-item"><div><h3>个人工作台与仓库自动发现</h3><p class="mono">personal-workbench</p><p>从个人连接开始，重建仓库发现、阅读与分享路径。</p><div class="row" style="margin-top:18px">${button("查看方案", "change-detail")}${button("分享 Change", "share")}</div></div>${badge("技术方案", "warning")}</article><article class="change-item"><div><h3>原型发布与固定版本</h3><p>交付已归档，记录保留在仓库中。</p></div>${badge("已完成")}</article></section>`;
  else if (c.tab === "prototypes")
    content = `<section class="proto-grid">${["个人工作台", "连接与发现"].map((title, i) => `<article class="proto-card"><a class="proto-art" href="#public" aria-label="公开预览${title}"><div class="mini-shell"><div class="mini-side"></div><div class="mini-body"><div class="mini-line short"></div><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></div></a><div class="proto-info"><div class="row spread"><h3>${title}</h3>${badge("公开预览")}</div><p>PC Web · iPad · Mobile</p><div class="row" style="margin-top:15px"><a class="btn" href="#public">打开原型 ↗</a>${button("分享", "share-public")}</div></div></article>`).join("")}</section>`;
  else
    content = `<div class="document-layout"><nav class="doc-nav" aria-label="Spec 目录"><p>项目知识</p>${Object.entries(
      docs,
    )
      .map(
        ([id, [title]]) =>
          `<a href="#repo/${r.id}/specs/${id}" class="${c.doc === id ? "active" : ""}">${title}</a>`,
      )
      .join(
        "",
      )}</nav><article class="document"><div class="doc-byline"><span>SPEC</span><span>项目知识 / ${c.doc}</span></div><h1>${d[0]}</h1><p>${d[1]}</p><h2>围绕仓库继续协作</h2><p>选择你参与的项目，查看已经合入的能力和仍在推进的 Change。阅读时始终保留来源分支、文件路径和快照信息。</p><blockquote>Specs 描述当前有效的能力；Changes 记录一次变化如何发生。两者共同保留项目的上下文。</blockquote><h2>从同一份事实出发</h2><ul><li>工程记录来自已经推送的提交。</li><li>分享文档后，对方使用自己的账号验证读取权限。</li><li>原型有独立的公开预览入口，无需仓库账号。</li></ul><h2>来源</h2><p class="mono">docs/project/specs/project-knowledge/spec.md</p><p>main · 8bd2a6c · 示例快照</p></article></div>`;
  return shell(
    `<div class="repo-header"><div class="repo-heading"><div><h1>${r.name}</h1><p class="mono">${r.path} · GitHub</p></div>${button("分享", "share", false, "branch")}</div>${tabs}</div><div class="source"><span class="row">${icon("branch")}<span>${c.tab === "changes" ? "全部已推送分支" : "main · 守护分支"}</span></span><span class="desktop-label">${c.tab === "prototypes" ? "原型全部公开访问" : "最近同步 · 刚刚"}</span><button class="mobile-docs" data-action="docs">目录</button></div>${content}`,
    r.name,
  );
}
function denied() {
  return shell(
    `<div class="empty" style="padding-top:90px">${icon("branch")}<h2>当前连接无法读取这份记录</h2><p>分享链接不会授予仓库权限。连接有权访问该仓库的 GitHub 账号后，将返回这份文档。</p><div class="row">${button("连接其他账号", "connect", true)}<a class="btn" href="#home">返回我的仓库</a></div></div>`,
    "打开分享链接",
  );
}
function publicPreview() {
  return `<main><header class="public-header"><a class="brand" href="#home"><img src="${mark}" alt="">OpenFolio</a>${badge("公开原型")}<button class="btn quiet" data-action="share-public">分享链接 ↗</button></header><section class="public-canvas"><p>个人工作台 <span style="padding:0 7px">/</span> 固定版本预览 · 无需连接账号</p><div class="preview-frame"><header><span>OpenFolio · 个人工作台</span><span>原型演示</span></header><div class="preview-demo"><div class="eyebrow">MY REPOSITORIES</div><h2>我的仓库</h2><p>项目的上下文，从你参与的仓库开始。</p>${repos
    .slice(0, 2)
    .map(
      (r) =>
        `<div class="repo-row"><div class="row"><span class="repo-symbol ${r.tone}">${r.symbol}</span><div><strong>${r.name}</strong><p class="repo-meta">${r.path}</p></div></div><button class="btn quiet" data-action="preview-action">查看 →</button></div>`,
    )
    .join(
      "",
    )}</div></div><div class="public-foot">当前为交互方案示例 · 原型公开不授予工程文档访问权限</div></section></main>`;
}
function render() {
  const c = current();
  $("#app").innerHTML =
    c.page === "welcome"
      ? welcome()
      : c.page === "public"
        ? publicPreview()
        : c.page === "connections"
          ? shellGuard(connections)
          : c.page === "repo"
            ? shellGuard(repository)
            : c.page === "denied"
              ? denied()
              : shellGuard(home);
  bind();
}
function shellGuard(fn) {
  return state.connected ? fn() : welcome();
}
function openDialog(title, body, actions = "") {
  dialogTrigger = document.activeElement;
  const d = $("#dialog");
  d.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-btn" aria-label="关闭弹窗" data-close>${icon("close")}</button></div>${body}${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`;
  d.showModal();
  $("[data-close]", d).onclick = () => d.close();
  bind(d);
}
$("#dialog").addEventListener("close", () => dialogTrigger?.focus());
function connect(replacing = false) {
  openDialog(
    replacing ? "更新 GitHub 连接" : "连接 GitHub",
    `<p>使用个人访问令牌连接。我们会识别账号，自动发现你有权读取的 SpecTrail 仓库。</p><div class="scope-list">选择需要访问的仓库<br><strong>Contents：Read-only</strong><br>Metadata 读取权限会自动包含</div><label for="demo-token">个人访问令牌</label><input id="demo-token" type="password" autocomplete="off" placeholder="原型中输入 demo 即可" aria-describedby="token-help"><p class="form-help" id="token-help">这里只模拟交互，请勿填写真实 token。<br><a href="https://github.com/settings/personal-access-tokens/new?name=OpenFolio&contents=read" target="_blank" rel="noreferrer">前往 GitHub 生成令牌 ↗</a></p><p id="form-error" class="form-error" role="alert"></p>`,
    button("取消", "cancel") +
      button(
        replacing ? "更新并重新发现" : "验证并发现仓库",
        replacing ? "save-replacement" : "save-connection",
        true,
      ),
  );
}
function bind(root = $("#app")) {
  root
    .querySelectorAll("[data-action]")
    .forEach((el) => (el.onclick = () => action(el.dataset.action, el)));
  root.querySelectorAll("[data-filter]").forEach(
    (el) =>
      (el.onclick = () => {
        state.filter = el.dataset.filter;
        render();
      }),
  );
  const search = $("#repo-search", root);
  if (search)
    search.oninput = () => {
      const position = search.selectionStart;
      state.query = search.value;
      render();
      const next = $("#repo-search");
      next.focus();
      try {
        next.setSelectionRange(position, position);
      } catch {}
    };
}
function action(name, el) {
  const close = () => $("#dialog").close();
  if (name === "cancel") return close();
  if (name === "connect") return connect();
  if (name === "replace") return connect(true);
  if (name === "save-connection" || name === "save-replacement") {
    const input = $("#demo-token");
    if (input.value !== "demo") {
      input.value = "";
      input.setAttribute("aria-invalid", "true");
      $("#form-error").textContent =
        "原型仅接受 demo，不验证或保存真实 token。";
      return;
    }
    input.value = "";
    const wasDenied = current().page === "denied";
    state.connected = true;
    if (name === "save-connection" && !state.accountNames.includes("demo-user"))
      state.accountNames.push("demo-user");
    state.accounts = state.accountNames.length;
    close();
    state.scenario = "scanning";
    $("#scenario").value = "scanning";
    go(wasDenied ? "repo/open-folio/specs" : "home");
    toast("示例账号已连接，正在发现仓库");
    return;
  }
  if (name === "rescan") {
    state.scenario = "scanning";
    $("#scenario").value = "scanning";
    go("home");
    return;
  }
  if (name === "finish-scan") {
    state.scenario = "home";
    $("#scenario").value = "home";
    render();
    toast("发现完成，3 个仓库已接入 SpecTrail");
    return;
  }
  if (name === "clear-search") {
    state.query = "";
    render();
    return;
  }
  if (name === "check") {
    openDialog(
      "检查仓库地址",
      `<p>使用当前 GitHub 连接检查读取权限及 SpecTrail 接入情况。</p><label for="repo-url">HTTPS 仓库地址</label><input id="repo-url" type="url" placeholder="https://github.com/owner/repository"><p class="form-help">示例：填写 open-folio 可体验接入成功；其他地址演示未接入。</p><div id="check-result" role="status"></div>`,
      button("关闭", "cancel") + button("检查仓库", "check-submit", true),
    );
    return;
  }
  if (name === "check-submit") {
    const value = $("#repo-url").value;
    if (!/^https:\/\/github\.com\/[^/]+\/[^/?#]+\/?$/.test(value)) {
      $("#check-result").innerHTML =
        '<p class="form-error">请输入完整的 GitHub HTTPS 仓库地址。</p>';
      return;
    }
    $("#check-result").innerHTML = value.includes("open-folio")
      ? '<div class="notice" style="margin-top:20px">已识别 SpecTrail 配置，可以进入仓库。<a href="#repo/open-folio/specs" data-enter>打开仓库 →</a></div>'
      : '<div class="notice warning" style="margin-top:20px">可以读取仓库，但默认分支尚未发现 SpecTrail 配置。接入并推送后重新检查。</div>';
    const link = $("[data-enter]");
    if (link) link.onclick = close;
    return;
  }
  if (name === "share" || name === "share-public") {
    const pub = name === "share-public";
    const url = location.href.split("#")[0] + (pub ? "#public" : location.hash);
    openDialog(
      pub ? "分享公开原型" : "分享工程记录",
      `<p>${pub ? "任何拿到链接的人都可打开这个固定版本，无需 GitHub 账号。" : "对方使用自己的 GitHub 账号验证权限，随后回到当前阅读位置。"}</p><div class="share-field">${esc(url)}</div><p class="form-help">${pub ? "公开范围仅包含原型展示内容。" : "链接不包含 token 或访问授权。此处为方案原型链接。"}</p>`,
      button("关闭", "cancel") + button("选择链接", "select-link", true),
    );
    return;
  }
  if (name === "select-link") {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($(".share-field"));
    selection.removeAllRanges();
    selection.addRange(range);
    toast("链接已选中，可复制分享");
    return;
  }
  if (name === "remove") {
    state.pendingRemove = Number(el.dataset.index);
    openDialog(
      "移除这个连接？",
      "<p>对应的仓库记录将从当前工作台移除。GitHub 仓库权限和已公开原型不受影响。</p>",
      button("取消", "cancel") + button("移除连接", "remove-confirm", true),
    );
    return;
  }
  if (name === "remove-confirm") {
    state.accountNames.splice(state.pendingRemove, 1);
    state.accounts = state.accountNames.length;
    close();
    if (!state.accounts) {
      state.connected = false;
      go("welcome");
    } else {
      state.scenario = "home";
      render();
    }
    toast("示例连接已移除");
    return;
  }
  if (name === "logout") {
    state.connected = false;
    close();
    go("welcome");
    toast("已退出当前示例工作台");
    return;
  }
  if (name === "docs") {
    openDialog(
      "Spec 目录",
      Object.entries(docs)
        .map(
          ([id, [title]]) =>
            `<p style="margin:16px 0"><a href="#repo/${current().repo}/specs/${id}" data-doc>${title}</a></p>`,
        )
        .join(""),
    );
    $("#dialog")
      .querySelectorAll("[data-doc]")
      .forEach((a) => (a.onclick = close));
    return;
  }
  if (name === "change-detail") {
    openDialog(
      "个人工作台与仓库自动发现",
      '<p>技术方案 · personal-workbench</p><div class="scope-list">连接个人 GitHub → 发现 SpecTrail 仓库 → 阅读与分享。<br>工程文档按仓库权限读取，原型公开预览。</div><p style="margin-top:16px">此处展示 Change 阅读交互，正式记录来自已推送的 Change 主分支。</p>',
      button("关闭", "cancel"),
    );
    return;
  }
  if (name === "preview-action")
    return toast("这是公开原型中的演示操作，不会读取仓库");
}
window.addEventListener("hashchange", () => {
  if ($("#dialog").open) $("#dialog").close();
  render();
});
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    go("home");
    setTimeout(() => $("#repo-search")?.focus(), 0);
  }
});
if (!location.hash) location.hash = "home";
render();
