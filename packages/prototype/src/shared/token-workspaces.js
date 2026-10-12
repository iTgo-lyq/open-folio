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
const btn = (label, action, primary = false) =>
  `<button class="btn ${primary ? "primary" : ""}" data-action="${action}">${label}</button>`;
const repoFixtures = [
  { name: "OpenFolio", path: "demo-user / open-folio", symbol: "O", count: 6 },
  { name: "SpecTrail", path: "demo-user / spec-trail", symbol: "S", count: 4 },
  { name: "Docs Kit", path: "example-team / docs-kit", symbol: "D", count: 3 },
];
let workspaces, state, toastTimer, trigger;
function reset(scenario = "home") {
  workspaces = {
    demo: {
      label: "日常阅读",
      id: "8c6a · 示例",
      token: "demo",
      repos: [...repoFixtures],
      cached: true,
      devices: [
        { id: "desktop", label: "Chrome · 桌面", seen: "刚刚" },
        { id: "mobile", label: "Safari · 手机", seen: "今天 09:20" },
      ],
    },
    "demo-other": {
      label: "另一个凭据",
      id: "2d91 · 示例",
      token: "demo-other",
      repos: [],
      cached: false,
      devices: [],
    },
  };
  state = {
    scenario,
    token: scenario === "other" ? "demo-other" : "demo",
    connected: !["login", "device", "legacy"].includes(scenario),
    device: scenario === "device" ? "mobile" : "desktop",
    page: scenario === "legacy" ? "legacy" : "home",
    restored: false,
    query: "",
    collapsed: false,
  };
  if (scenario === "other")
    workspaces["demo-other"].devices.push({
      id: "desktop",
      label: "Chrome · 桌面",
      seen: "刚刚",
    });
  $("#scenario").value = scenario;
  render();
}
function workspace() {
  return workspaces[state.token];
}
function toast(message) {
  clearTimeout(toastTimer);
  $(".toast").textContent = message;
  toastTimer = setTimeout(() => ($(".toast").textContent = ""), 3500);
}
function badge(text, tone = "success") {
  return `<span class="badge ${tone}"><span class="dot"></span>${text}</span>`;
}
function shell(content, title = "我的仓库") {
  const allowed =
    state.connected && state.scenario !== "expired" && workspace().repos.length;
  const nav = [
    ["branch", "我的仓库", "home"],
    ["specs", "Specs", "reading"],
    ["changes", "Changes", "reading"],
    ["prototypes", "原型", "reading"],
  ]
    .map(
      ([svg, name, page], i) =>
        `<button aria-label="${name}" ${i && !allowed ? "disabled" : ""} ${state.page === page && i < 2 ? 'aria-current="page"' : ""} data-action="${page}">${icon(svg)}<span>${name}</span></button>`,
    )
    .join("");
  return `<div class="shell ${state.collapsed ? "rail-collapsed" : ""}"><aside class="module-rail"><button class="shell-brand" data-action="rail" aria-label="${state.collapsed ? "展开侧栏" : "收起侧栏"}" aria-expanded="${!state.collapsed}"><img src="${mark}" alt="OpenFolio"><span class="restore-handle"></span></button><nav class="module-nav" aria-label="工作台模块">${nav}</nav><button class="rail-footer" data-action="credentials" aria-label="当前凭据">${icon("settings")}</button></aside><main class="work-area"><header class="topbar"><div class="header-context row"><span class="project-monogram">O</span><span class="header-module">${title}</span></div><div class="header-actions row">${state.connected ? `<button class="btn quiet" data-action="credentials">@demo-user</button>` : ""}<button class="icon-btn" data-action="credentials" aria-label="当前凭据">${icon("settings")}</button></div></header><div class="source"><span class="row"><span class="status-dot ${state.scenario === "expired" ? "warning" : ""}"></span>${state.connected ? `GitHub · ${esc(workspace().label)}` : "使用 Git 凭据登录"}</span><span class="source-caption">${state.connected ? "当前凭据工作台" : "OpenFolio"}</span></div><div class="body">${content}</div></main></div><nav class="module-nav mobile-navigation" aria-label="移动工作台模块">${nav}</nav>`;
}
function login(switching = false) {
  return `<section class="credential-login"><div class="eyebrow">YOUR WORKSPACE</div><h1>${switching ? "切换凭据" : "登录你的工作台"}</h1><p>使用相同 token，在另一台设备继续阅读。</p><div class="platform-caption"><span class="repo-symbol">GH</span><div><strong>GitHub</strong><p><span>github.com</span></p></div></div><form id="login-form"><label for="git-username">Git 用户名</label><input id="git-username" name="username" autocomplete="username" placeholder="例如 demo-user" value="demo-user" required><label for="git-token">Token</label><input id="git-token" name="token" type="password" autocomplete="off" placeholder="原型中输入 demo 或 demo-other" aria-describedby="demo-help" required><p class="form-error" id="login-error" role="alert"></p><button class="btn primary" type="submit">${switching ? "验证并切换" : "登录工作台"}</button>${switching ? btn("返回当前工作台", "credentials") : ""}</form><p class="form-help" id="demo-help">示例 token：demo 恢复已有工作台；demo-other 进入另一个工作台。请勿输入真实凭据。</p></section>`;
}
function home() {
  const w = workspace();
  if (state.scenario === "expired")
    return `<section class="home"><div class="empty">${icon("branch")}<h2>当前 token 无法验证</h2><p>重新检查凭据后继续阅读，或使用另一个 token 登录。</p><div class="row">${btn("重试验证", "retry", true)}${btn("切换凭据", "switch")}</div></div></section>`;
  const results = w.repos.filter(
    (r) =>
      !state.query ||
      (r.name + r.path).toLowerCase().includes(state.query.toLowerCase()),
  );
  return `<section class="home"><div class="intro"><div><div class="eyebrow">MY REPOSITORIES</div><h1>我的仓库</h1><p>项目的上下文，从你参与的仓库开始。</p></div>${btn("重新发现", "discover")}</div>${state.restored ? '<div class="notice workspace-restored">工作台已恢复，可以继续上次的阅读。</div>' : ""}<div class="toolbar"><span>${w.repos.length} 个已接入仓库</span><label class="search">${icon("search")}<input type="search" id="repo-search" aria-label="查找仓库" placeholder="查找仓库…" value="${esc(state.query)}"></label></div>${results.map((r) => `<a class="repo-row" href="#reading" data-action="reading"><div class="row"><span class="repo-symbol">${r.symbol}</span><div><strong>${r.name}</strong><p class="repo-meta mono">${r.path}</p></div></div><div class="repo-content">${r.count} Specs · 1 Change</div>${badge("已接入")}${icon("chevron")}</a>`).join("")}${!w.repos.length ? `<div class="empty">${icon("branch")}<h2>开始发现你的仓库</h2><p>这是另一个 token 的工作台。发现并读取后，你可以在其他设备继续使用。</p>${btn("发现仓库", "discover", true)}</div>` : !results.length ? '<div class="empty"><h2>没有匹配的仓库</h2></div>' : ""}<div class="section-note"><span>${w.cached ? "已恢复 · 最近阅读可用" : "尚未采集工程记录"}<br>当前凭据：${esc(w.label)}</span><button data-action="credentials">管理凭据 →</button></div></section>`;
}
function credentials() {
  const w = workspace();
  return `<section class="connections"><div class="intro"><div><div class="eyebrow">CREDENTIALS</div><h1>当前凭据</h1><p>在其他设备使用同一个 token，恢复这份工作台。</p></div>${btn("切换凭据", "switch")}</div><article class="connection-card"><div class="connection-detail"><div class="row"><span class="repo-symbol">GH</span><div><h3>@demo-user</h3><p class="repo-meta">GitHub · github.com</p></div></div>${badge(state.scenario === "expired" ? "需要检查" : "已登录", state.scenario === "expired" ? "danger" : "success")}</div><div class="credential-topline">${badge(w.label, "neutral")}<span class="repo-meta">工作台 ${w.id}</span></div><p>Token 已保存在服务端。复制后可在另一台设备登录。</p><div class="credential-actions">${btn("复制 token", "copy", true)}${btn("重新发现", "discover")}</div></article><section class="credential-section"><h2>登录设备</h2><p>每台设备独立登录，退出一台设备后可以在其他设备继续使用。</p><div class="device-list">${w.devices.map((d) => `<div class="device-row"><div><div class="row"><strong>${d.label}</strong>${d.id === state.device ? badge("当前设备") : ""}</div><p>最近使用 · ${d.seen}</p></div>${d.id !== state.device ? `<button class="btn quiet" data-action="revoke" data-device="${d.id}">退出此设备</button>` : ""}</div>`).join("")}</div><div class="credential-actions">${btn("退出当前设备", "logout")}${btn("退出全部设备", "logout-all")}</div></section></section>`;
}
function legacy() {
  return `<section class="connections"><div class="intro"><div><div class="eyebrow">CONTINUE READING</div><h1>选择要继续的凭据</h1><p>找到了这台设备原来保存的连接。选择一份继续阅读。</p></div></div>${["demo", "demo-other"].map((token, i) => `<div class="legacy-choice"><div><h3>@demo-user · ${i ? "另一个凭据" : "日常阅读"}</h3><p>GitHub · ${i ? "独立工作台" : "3 个已接入仓库"}</p></div><button class="btn" data-action="legacy-login" data-token="${token}">继续使用</button></div>`).join("")}<p class="connection-tip">其他凭据会保留，之后可使用对应 token 登录。</p></section>`;
}
function reading() {
  return `<article class="document"><div class="doc-byline"><span>SPEC</span><span>项目知识 / 示例记录</span></div><h1>项目知识工作台</h1><p>从仓库已推送的记录，了解项目当前的能力与改动。</p><h2>继续上次的阅读</h2><p>这份示例快照已经存在于当前凭据工作台。在另一台设备使用相同 token 登录后，可以从这里继续。</p><h2>来源</h2><p class="mono">docs/project/specs/project-knowledge/spec.md</p><p>main · 8bd2a6c · 示例快照</p></article>`;
}
function render() {
  $("#app").innerHTML =
    state.page === "legacy"
      ? shell(legacy(), "恢复原有连接")
      : !state.connected
        ? shell(login(), "登录")
        : state.page === "switch"
          ? shell(login(true), "切换凭据")
          : state.page === "credentials"
            ? shell(credentials(), "当前凭据")
            : state.page === "reading"
              ? shell(reading(), "Specs")
              : shell(home());
  bind($("#app"));
  const form = $("#login-form");
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      const token = $("#git-token").value.trim(),
        username = $("#git-username").value.trim();
      $("#git-token").value = "";
      if (!["demo", "demo-other"].includes(token)) {
        $("#login-error").textContent =
          "原型仅接受 demo 或 demo-other，不验证或保留真实 token。";
        return;
      }
      if (username !== "demo-user") {
        $("#login-error").textContent = "示例用户名为 demo-user。凭据未切换。";
        return;
      }
      signIn(token);
    };
  const search = $("#repo-search");
  if (search)
    search.oninput = () => {
      const start = search.selectionStart;
      state.query = search.value;
      render();
      const next = $("#repo-search");
      next.focus();
      try {
        next.setSelectionRange(start, start);
      } catch {}
    };
}
function signIn(token) {
  if (state.connected)
    workspace().devices = workspace().devices.filter(
      (d) => d.id !== state.device,
    );
  state.token = token;
  const w = workspace();
  if (!w.devices.some((d) => d.id === state.device))
    w.devices.push({
      id: state.device,
      label: state.device === "mobile" ? "Safari · 手机" : "Chrome · 桌面",
      seen: "刚刚",
    });
  state.connected = true;
  state.page = "home";
  state.query = "";
  state.restored = w.cached;
  state.scenario = token === "demo" ? "home" : "other";
  $("#scenario").value = state.scenario;
  render();
  toast(
    w.cached
      ? "已恢复相同 token 的工作台"
      : "已进入独立工作台，可以开始发现仓库",
  );
}
function openDialog(title, body, actions = "") {
  trigger = document.activeElement;
  const d = $("#dialog");
  d.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="关闭弹窗">${icon("close")}</button></div>${body}<div class="dialog-actions">${actions}</div>`;
  d.showModal();
  bind(d);
}
function bind(root) {
  root.querySelectorAll("[data-action]").forEach(
    (el) =>
      (el.onclick = (e) => {
        e.preventDefault();
        action(el.dataset.action, el);
      }),
  );
}
async function action(name, el) {
  if (name === "rail") {
    state.collapsed = !state.collapsed;
    render();
    return;
  }
  if (name === "close") {
    $("#dialog").close();
    return;
  }
  if (["home", "credentials", "switch", "reading"].includes(name)) {
    state.page = name;
    render();
    return;
  }
  if (name === "legacy-login") {
    signIn(el.dataset.token);
    return;
  }
  if (name === "retry") {
    toast("当前示例凭据已失效，请切换为有效凭据");
    return;
  }
  if (name === "discover") {
    const w = workspace();
    w.repos = state.token === "demo" ? [...repoFixtures] : [repoFixtures[0]];
    w.cached = true;
    state.page = "home";
    state.restored = false;
    render();
    toast("发现完成，当前凭据的仓库已准备好");
    return;
  }
  if (name === "copy") {
    const token = workspace().token;
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(token);
      toast("示例 token 已复制；原型不会处理真实凭据");
    } catch {
      openDialog(
        "复制示例 token",
        `<p>自动复制不可用，请选择下方示例值手动复制。</p><input class="demo-copy-field" aria-label="示例 token" value="${token}" readonly>`,
        btn("完成", "close"),
      );
      $(".demo-copy-field").select();
    }
    return;
  }
  if (name === "revoke") {
    workspace().devices = workspace().devices.filter(
      (d) => d.id !== el.dataset.device,
    );
    render();
    toast("已退出该示例设备，当前设备保持登录");
    return;
  }
  if (name === "logout-all") {
    openDialog(
      "退出全部设备？",
      "<p>这些设备需要重新使用 token 登录，工作台和阅读记录会保留。</p>",
      btn("取消", "close") + btn("退出全部设备", "logout-confirm", true),
    );
    return;
  }
  if (name === "logout" || name === "logout-confirm") {
    const all = name === "logout-confirm";
    workspace().devices = all
      ? []
      : workspace().devices.filter((d) => d.id !== state.device);
    if ($("#dialog").open) $("#dialog").close();
    state.connected = false;
    state.page = "home";
    state.restored = false;
    render();
    toast(
      all ? "已退出全部示例设备，工作台已保留" : "已退出当前设备，工作台已保留",
    );
  }
}
$("#scenario").onchange = (e) => reset(e.target.value);
$("#dialog").addEventListener("close", () => {
  $("#dialog").innerHTML = "";
  if (trigger?.isConnected) trigger.focus();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#dialog").open) $("#dialog").close();
});
reset();
