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
      label: "组织工程",
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
    connected: !["login", "device"].includes(scenario),
    device: scenario === "device" ? "mobile" : "desktop",
    remembered: ["login", "device"].includes(scenario)
      ? []
      : ["multi", "switch-error", "network"].includes(scenario)
        ? ["demo", "demo-other"]
        : [scenario === "other" ? "demo-other" : "demo"],
    page: ["multi", "switch-error", "network"].includes(scenario)
      ? "credentials"
      : "home",
    invalid: scenario === "switch-error" ? "demo-other" : "",
    restored: false,
    collapsed: false,
  };
  if (state.remembered.includes("demo-other"))
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
  return `<div class="shell ${state.collapsed ? "rail-collapsed" : ""}"><aside class="module-rail"><button class="shell-brand" data-action="rail" aria-label="${state.collapsed ? "展开侧栏" : "收起侧栏"}" aria-expanded="${!state.collapsed}"><img src="${mark}" alt="OpenFolio"><span class="restore-handle"></span></button><nav class="module-nav" aria-label="工作台模块">${nav}</nav><button class="rail-footer" data-action="credentials" aria-label="当前凭据">${icon("settings")}</button></aside><main class="work-area"><header class="topbar"><div class="header-context row"><span class="project-monogram">O</span><span class="header-module">${title}</span></div><div class="header-actions row"><details class="header-source"><summary aria-label="查看读取状态">${icon("branch")}<span class="header-source-label">${state.connected ? esc(workspace().label) : "GitHub"}</span></summary><div class="header-source-details"><span>${state.connected ? `GitHub · ${esc(workspace().label)}` : "使用 Git 凭据登录"}</span><span>${state.connected ? "当前凭据工作台" : "OpenFolio"}</span></div></details>${state.connected ? `<button class="btn quiet" data-action="credentials">@demo-user</button>` : ""}<button class="icon-btn" data-action="credentials" aria-label="当前凭据">${icon("settings")}</button></div></header><div class="body">${content}</div></main></div><nav class="module-nav mobile-navigation" aria-label="移动工作台模块">${nav}</nav>`;
}
function login(switching = false) {
  return `<section class="credential-login"><div class="eyebrow">YOUR WORKSPACE</div><h1>${switching ? "添加身份" : "登录你的工作台"}</h1><p>首次添加输入 token，以后在此浏览器直接点选切换。</p><div class="platform-caption"><span class="repo-symbol">GH</span><div><strong>GitHub</strong><p><span>github.com</span></p></div></div><form id="login-form"><label for="git-username">显示名称（可选）</label><input id="git-username" name="username" autocomplete="off" maxlength="100" placeholder="例如：日常阅读、组织工程"><label for="git-token">Token</label><input id="git-token" name="token" type="password" autocomplete="off" placeholder="原型中输入 demo 或 demo-other" aria-describedby="demo-help" required><p class="form-error" id="login-error" role="alert"></p><button class="btn primary" type="submit">${switching ? "添加并使用" : "登录工作台"}</button>${switching ? btn(state.connected ? "返回当前凭据" : "返回身份列表", "credentials") : ""}</form><p class="form-help" id="demo-help">示例 token：demo 恢复已有工作台；demo-other 进入另一个工作台。请勿输入真实凭据。</p></section>`;
}
function identityList() {
  return `<section class="identity-section" aria-label="此浏览器的身份"><h2>此浏览器的身份</h2><p>直接切换到已添加的身份。每个身份保留自己的仓库和阅读记录。</p><div class="identity-list">${state.remembered
    .map((token) => {
      const w = workspaces[token],
        current = state.connected && state.token === token;
      return `<div class="identity-row" data-identity="${token}"><div class="identity-name"><strong>${esc(w.label)}</strong><p>@demo-user · GitHub</p></div>${current ? badge("当前身份") : state.invalid === token ? badge("需要重新登录", "danger") : ""}<div class="identity-actions"><button class="btn" data-action="activate" data-token="${token}" aria-label="切换到${esc(w.label)}" ${current ? "disabled" : ""}>${current ? "正在使用" : state.invalid === token ? "重新登录" : "切换"}</button><button class="btn quiet" data-action="remove" data-token="${token}" aria-label="移除${esc(w.label)}">移除</button></div></div>`;
    })
    .join("")}</div></section>`;
}
function selection() {
  return `<section class="connections"><div class="intro"><div><div class="eyebrow">YOUR IDENTITIES</div><h1>选择身份</h1><p>当前身份已退出，选择其他身份继续阅读。</p></div>${btn("添加身份", "switch", true)}</div>${identityList()}</section>`;
}
function home() {
  const w = workspace();
  if (state.scenario === "expired")
    return `<section class="home"><div class="empty">${icon("branch")}<h2>当前 token 无法验证</h2><p>重新检查凭据后继续阅读，或使用另一个 token 登录。</p><div class="row">${btn("重试验证", "retry", true)}${btn("切换凭据", "switch")}</div></div></section>`;
  return `<section class="home"><div class="intro"><div><div class="eyebrow">MY REPOSITORIES</div><h1>我的仓库</h1><p>项目的上下文，从你参与的仓库开始。</p></div>${btn("重新发现", "discover")}</div>${state.restored ? '<div class="notice workspace-restored">工作台已恢复，可以继续上次的阅读。</div>' : ""}<div class="toolbar"><span>${w.repos.length} 个已接入仓库</span></div>${w.repos.map((r) => `<a class="repo-row" href="#reading" data-action="reading"><div class="row"><span class="repo-symbol">${r.symbol}</span><div><strong>${r.name}</strong><p class="repo-meta mono">${r.path}</p></div></div><div class="repo-content">${r.count} Specs · 1 Change</div>${badge("已接入")}${icon("chevron")}</a>`).join("")}${!w.repos.length ? `<div class="empty">${icon("branch")}<h2>开始发现你的仓库</h2><p>这是另一个 token 的工作台。发现并读取后，你可以在其他设备继续使用。</p>${btn("发现仓库", "discover", true)}</div>` : ""}<div class="section-note"><span>${w.cached ? "已恢复 · 最近阅读可用" : "尚未采集工程记录"}<br>当前凭据：${esc(w.label)}</span><button data-action="credentials">管理凭据 →</button></div></section>`;
}
function credentials() {
  const w = workspace();
  return `<section class="connections"><div class="intro"><div><div class="eyebrow">CREDENTIALS</div><h1>当前凭据</h1><p>记住多个身份，在此浏览器点选切换。</p></div>${btn("添加身份", "switch")}</div>${identityList()}<article class="connection-card"><div class="connection-detail"><div class="row"><span class="repo-symbol">GH</span><div><h3>${esc(w.label)}</h3><p class="repo-meta">@demo-user · GitHub</p></div></div>${badge(state.scenario === "expired" ? "需要检查" : "已登录", state.scenario === "expired" ? "danger" : "success")}</div><p>复制 token 后，可在另一台设备恢复同一工作台。</p><div class="credential-actions">${btn("复制 token", "copy", true)}${btn("重新发现", "discover")}</div></article><section class="credential-section"><h2>当前身份的登录设备</h2><p>退出设备会同时取消它记住此身份的授权，需要重新输入 token。</p><div class="device-list">${w.devices.map((d) => `<div class="device-row"><div><div class="row"><strong>${d.label}</strong>${d.id === state.device ? badge("当前设备") : ""}</div><p>最近使用 · ${d.seen}</p></div>${d.id !== state.device ? `<button class="btn quiet" data-action="revoke" data-device="${d.id}">退出此设备</button>` : ""}</div>`).join("")}</div><div class="credential-actions">${btn("退出当前设备", "logout")}${btn("退出全部设备", "logout-all")}</div></section></section>`;
}
function reading() {
  return `<article class="document"><div class="doc-byline"><span>SPEC</span><span>项目知识 / 示例记录</span></div><h1>项目知识工作台</h1><p>从仓库已推送的记录，了解项目当前的能力与改动。</p><h2>继续上次的阅读</h2><p>这份示例快照已经存在于当前凭据工作台。在另一台设备使用相同 token 登录后，可以从这里继续。</p><h2>来源</h2><p class="mono">docs/project/specs/project-knowledge/spec.md</p><p>main · 8bd2a6c · 示例快照</p></article>`;
}
function render() {
  $("#app").innerHTML =
    state.page === "switch"
      ? shell(login(true), "添加身份")
      : !state.connected
        ? state.remembered.length
          ? shell(selection(), "选择身份")
          : shell(login(), "登录")
        : state.page === "credentials"
          ? shell(credentials(), "当前凭据")
          : state.page === "reading"
            ? shell(reading(), "Specs")
            : shell(home());
  bind($("#app"));
  const form = $("#login-form");
  if (form) {
    const submit = (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const token = $("#git-token").value.trim(),
        username = $("#git-username").value.trim();
      $("#git-token").value = "";
      if (!["demo", "demo-other"].includes(token)) {
        $("#login-error").textContent =
          "原型仅接受 demo 或 demo-other，不验证或保留真实 token。";
        return;
      }
      if (state.invalid === token) state.invalid = "";
      signIn(token, username);
    };
    form.onsubmit = submit;
    form.querySelector('button[type="submit"]').onclick = submit;
  }
}
function signIn(token, username = "") {
  state.token = token;
  const w = workspace();
  if (username) w.label = username;
  if (!state.remembered.includes(token)) state.remembered.push(token);
  if (!w.devices.some((d) => d.id === state.device))
    w.devices.push({
      id: state.device,
      label: state.device === "mobile" ? "Safari · 手机" : "Chrome · 桌面",
      seen: "刚刚",
    });
  state.connected = true;
  state.page = "credentials";
  state.restored = w.cached;
  if (!["switch-error", "network"].includes(state.scenario))
    state.scenario = token === "demo" ? "home" : "other";
  $("#scenario").value = state.scenario;
  render();
  focusHeading();
  toast(
    w.cached
      ? "已恢复相同 token 的工作台"
      : "已进入独立工作台，可以开始发现仓库",
  );
}
function focusHeading() {
  const heading = $("#app h1");
  heading.tabIndex = -1;
  heading.focus();
}
function forget(token, all = false) {
  const w = workspaces[token];
  w.devices = all ? [] : w.devices.filter((d) => d.id !== state.device);
  state.remembered = state.remembered.filter((t) => t !== token);
  if (state.token === token) {
    state.connected = false;
    state.restored = false;
  }
  if ($("#dialog").open) $("#dialog").close();
  state.page = "credentials";
  render();
  focusHeading();
  toast(
    all
      ? "已退出此身份的全部设备，工作台已保留"
      : "已从此浏览器移除身份，工作台已保留",
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
  if (name === "activate") {
    const token = el.dataset.token;
    if (!state.remembered.includes(token)) return;
    if (state.invalid === token) {
      toast("该身份需要重新登录；当前身份保持登录");
      state.page = "switch";
      render();
      $("#git-username").focus();
      return;
    }
    if (state.scenario === "network" && token !== state.token) {
      toast("平台暂时不可达，请稍后重试。当前身份保持登录");
      return;
    }
    signIn(token);
    return;
  }
  if (name === "remove") {
    const token = el.dataset.token;
    openDialog(
      "移除此身份？",
      `<p>从此浏览器移除“${esc(workspaces[token].label)}”后，需要重新输入 token 登录。工作台和其他设备的登录会保留。</p>`,
      btn("取消", "close") +
        `<button class="btn primary" data-action="remove-confirm" data-token="${token}">移除身份</button>`,
    );
    return;
  }
  if (name === "remove-confirm") {
    forget(el.dataset.token);
    return;
  }
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
    if (name === "switch") $("#git-username").focus();
    else focusHeading();
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
    forget(state.token, all);
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
reset("multi");
