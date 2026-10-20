const $ = (selector, root = document) => root.querySelector(selector);
const mark = "{{data:../assets/mark.png}}";
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8L22 6l-2 2-2-2-2 2 2 2-3 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  monitor:
    '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  phone:
    '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  shield:
    '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-2.8c3.3-.4 6.8-1.6 6.8-7a5.4 5.4 0 0 0-1.5-3.8A5 5 0 0 0 19.2.6S18 .2 15.2 2a13.4 13.4 0 0 0-6.4 0C6 .2 4.8.6 4.8.6a5 5 0 0 0-.1 3.8A5.4 5.4 0 0 0 3.2 8c0 5.4 3.5 6.6 6.8 7A3.5 3.5 0 0 0 9 18v4"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || `<use href="#icon-${name}"></use>`}</svg>`;
const button = (text, action, primary = false, extra = "") =>
  `<button class="btn${primary ? " primary" : ""}" data-action="${action}" ${extra}>${text}</button>`;
const badge = (text, tone = "success") =>
  `<span class="badge ${tone}"><span class="dot"></span>${text}</span>`;
const normal = (value) => value.trim().normalize("NFKC").toLowerCase();
const tokens = {
  demo: { login: "demo-user", repos: ["open-folio", "spec-trail"] },
  "demo-work": {
    login: "demo-user",
    repos: ["design-system", "engineering-notes"],
  },
};
let accounts,
  devices,
  browserId,
  ui,
  dialogState,
  dialogTrigger,
  toastTimer,
  nextId = 0,
  generation = 0;
const currentDevice = () => devices[browserId];
const currentAccount = () =>
  accounts.find((a) => a.id === currentDevice().accountId);
const currentBinding = () =>
  currentAccount()?.bindings.find((b) => b.id === currentDevice().activeId);
const bindings = () => currentAccount()?.bindings || [];
function reset(scenario = "tokens") {
  generation++;
  closeDialog();
  accounts = [
    {
      id: "lin",
      username: "lin",
      password: "demo12345",
      bindings: [
        { id: "daily", label: "日常项目", token: "demo", valid: true },
        { id: "work", label: "组织项目", token: "demo-work", valid: true },
      ],
    },
    {
      id: "chen",
      username: "chen",
      password: "demo12345",
      bindings: [
        { id: "personal", label: "个人仓库", token: "demo", valid: true },
      ],
    },
    { id: "new", username: "new-user", password: "demo12345", bindings: [] },
  ];
  devices = {
    A: { label: "Chrome · 桌面", accountId: "lin", activeId: "daily" },
    B: { label: "Safari · 手机", accountId: null, activeId: null },
  };
  browserId = "A";
  ui = {
    route: "account",
    tab: "tokens",
    register: scenario === "register",
    error: "",
    busy: false,
    network: scenario === "network",
    failedId: "",
  };
  if (["login", "register", "expired"].includes(scenario))
    Object.assign(devices.A, { accountId: null, activeId: null });
  if (scenario === "empty")
    Object.assign(devices.A, { accountId: "new", activeId: null });
  if (scenario === "devices") {
    devices.B.accountId = "lin";
    devices.B.activeId = "work";
    ui.tab = "devices";
  }
  if (scenario === "invalid") accounts[0].bindings[1].valid = false;
  if (scenario === "other") {
    devices.B.accountId = "chen";
    devices.B.activeId = "personal";
    browserId = "B";
  }
  if (scenario === "expired") ui.error = "登录已过期，请重新登录。";
  $("#scenario").value = scenario;
  render();
  $(".toast").textContent = "";
}
function toast(text) {
  clearTimeout(toastTimer);
  $(".toast").textContent = text;
  toastTimer = setTimeout(() => ($(".toast").textContent = ""), 3400);
}
function focusHeading() {
  const h = $("#app h1");
  if (h) {
    h.tabIndex = -1;
    h.focus({ preventScroll: true });
  }
}
function shell(content) {
  const account = currentAccount(),
    binding = currentBinding();
  const nav = [
    ["branch", "我的仓库", "home"],
    ["specs", "Specs", "reading"],
    ["changes", "Changes", "reading"],
    ["prototypes", "原型", "reading"],
  ]
    .map(
      ([name, label, action], i) =>
        `<button data-action="${action}" aria-label="${label}" ${i > 1 || (i && (!binding || !binding.valid)) ? "disabled" : ""} ${ui.route === action && i < 2 ? 'aria-current="page"' : ""}>${icon(name)}<span>${label}</span></button>`,
    )
    .join("");
  const accountTrigger = account
    ? `<button class="account-trigger" data-action="account" aria-label="管理账号 ${esc(account.username)}"><span class="account-avatar">${esc(account.username.slice(0, 1).toUpperCase())}</span><span>${esc(account.username)}</span></button>`
    : '<span class="muted small">尚未登录</span>';
  return `<div class="shell"><aside class="module-rail"><button class="shell-brand" data-action="home" aria-label="OpenFolio 首页"><img src="${mark}" alt="OpenFolio"></button><nav class="module-nav" aria-label="工作台模块">${nav}</nav><button class="rail-footer" data-action="account" aria-label="账号与凭据" ${ui.route === "account" ? 'aria-current="page"' : ""}>${icon("user")}</button></aside><main class="work-area"><header class="topbar"><div class="header-context row"><span class="project-monogram">O</span><span class="header-module">${!account ? "OpenFolio" : ui.route === "home" ? "我的仓库" : ui.route === "reading" ? "Specs" : "账号与凭据"}</span></div><div class="header-actions row">${account ? `<span class="header-binding">${icon("key")}${binding ? esc(binding.label) : "未选择 Token"}</span>` : ""}${accountTrigger}</div></header><div class="body">${content}</div></main></div><nav class="module-nav mobile-navigation" aria-label="移动工作台模块">${nav}</nav>`;
}
function auth() {
  const register = ui.register;
  return `<section class="auth-layout"><div class="auth-panel"><div class="auth-brand"><img src="${mark}" alt="">OpenFolio</div><h1>${register ? "创建你的账号" : "登录你的工作台"}</h1><p class="auth-description">${register ? "设置账号和密码，开始管理你的 Token。" : "登录账号，继续使用已绑定的 Token。"}</p><div class="auth-tabs" role="group" aria-label="登录或注册"><button data-action="login-mode" aria-pressed="${!register}">登录</button><button data-action="register-mode" aria-pressed="${register}">注册</button></div><form id="auth-form" class="account-form"><div class="form-field"><label for="username">账号</label><input id="username" name="username" maxlength="64" autocomplete="username" placeholder="填写你的账号" required></div><div class="form-field"><label for="password">密码</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="8" maxlength="128" placeholder="${register ? "至少 8 个字符" : "填写你的密码"}" required><button type="button" data-action="show-password" aria-label="显示密码" aria-pressed="false">${icon("eye")}</button></div></div>${register ? '<div class="form-field"><label for="confirm-password">确认密码</label><input id="confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="再次填写密码" required></div>' : ""}<p class="form-error" id="auth-error" role="alert">${esc(ui.error)}</p><button class="btn primary" type="submit">${register ? "注册并登录" : "登录"}</button></form><details class="sample-help" open><summary>原型示例账号</summary><p><span class="mono">lin / demo12345</span><br><span class="mono">chen / demo12345</span><br>也可切到注册，自行填写示例账号和密码。</p></details></div></section>`;
}
function accountPage() {
  const account = currentAccount();
  const count = Object.values(devices).filter(
    (d) => d.accountId === account.id,
  ).length;
  return `<section class="account-page"><div class="intro"><div><h1>账号与凭据</h1><p>管理绑定的 Token 和登录设备。</p></div>${button("退出登录", "logout")}</div><div class="account-profile"><span class="account-avatar">${esc(account.username.slice(0, 1).toUpperCase())}</span><div><strong>${esc(account.username)}</strong><p>OpenFolio 账号</p></div><span class="browser-label">${icon(browserId === "A" ? "monitor" : "phone")}当前浏览器 · ${browserId}</span></div><div class="account-tabs" role="tablist" aria-label="账号管理"><button role="tab" id="tokens-tab" aria-controls="account-content" data-action="tokens" aria-selected="${ui.tab === "tokens"}">Token<span class="tab-count">${account.bindings.length}</span></button><button role="tab" id="devices-tab" aria-controls="account-content" data-action="devices" aria-selected="${ui.tab === "devices"}">登录设备<span class="tab-count">${count}</span></button></div><div id="account-content" role="tabpanel" aria-labelledby="${ui.tab}-tab">${ui.error ? `<div class="notice danger" role="alert">${esc(ui.error)}${ui.failedId ? '<button data-action="retry-switch">重试</button>' : ""}</div>` : ""}${ui.tab === "devices" ? deviceList() : tokenList()}</div></section>`;
}
function tokenList() {
  const items = bindings(),
    selected = currentBinding();
  const list = items.length
    ? `<div class="token-list">${items
        .map((b) => {
          const current = selected?.id === b.id;
          return `<article class="token-row ${current ? "is-current" : ""}" data-binding="${b.id}"><span class="token-mark">${icon("github")}</span><div class="token-name"><div class="token-title"><strong>${esc(b.label)}</strong>${!b.valid ? badge("已失效", "danger") : current ? badge("当前使用") : ""}</div><p>GitHub · <span class="mono">@${tokens[b.token].login}</span></p></div><div class="token-actions"><button class="btn" data-action="select" data-id="${b.id}" ${current || ui.busy ? "disabled" : ""}>${ui.busy === b.id ? "验证中…" : current ? `${icon("check")}已选用` : "使用"}</button><details class="token-menu"><summary aria-label="管理${esc(b.label)}">${icon("more")}</summary><div class="token-menu-items"><button data-action="rename" data-id="${b.id}">重命名</button>${current ? '<button data-action="copy">复制 Token</button>' : ""}<button class="danger" data-action="remove" data-id="${b.id}">解除绑定</button></div></details></div></article>`;
        })
        .join("")}</div>`
    : `<div class="account-empty"><span class="token-mark">${icon("key")}</span><h3>添加第一个 Token</h3><p>绑定后，换个浏览器登录也能直接使用。</p>${button(`${icon("plus")}添加 Token`, "add", true)}</div>`;
  return `<div class="account-section-head"><div><h2>已绑定的 Token</h2><p>选择本浏览器读取仓库时使用的凭据。</p></div>${items.length ? button(`${icon("plus")}添加 Token`, "add", true) : ""}</div>${list}<p class="account-hint">${icon("shield")}Token 保存在你的账号中，退出登录后仍会保留。</p>${items.some((b) => !b.valid) ? '<p class="account-hint">Token 已失效时，请解除绑定后重新添加。</p>' : ""}<div class="selection-status"><span class="dot" style="color:${selected?.valid ? "var(--green)" : "var(--muted)"}"></span><span>${selected ? `本浏览器使用 · ${esc(selected.label)}` : "本浏览器尚未选择 Token"}</span>${selected ? '<button data-action="home">查看仓库 →</button>' : ""}</div>`;
}
function deviceList() {
  const account = currentAccount();
  return `<div class="account-section-head"><div><h2>已登录的设备</h2><p>退出设备会撤销它的账号登录。</p></div></div><div class="account-device-list">${Object.entries(
    devices,
  )
    .filter(([, d]) => d.accountId === account.id)
    .map(
      ([id, d]) =>
        `<div class="account-device" data-device="${id}"><span class="token-mark">${icon(id === "A" ? "monitor" : "phone")}</span><div class="account-device-info"><div class="row"><strong>${d.label}</strong>${id === browserId ? badge("当前设备") : ""}</div><p>最近使用 · ${id === browserId ? "刚刚" : "今天 09:20"}</p></div>${id !== browserId ? button("退出此设备", "revoke", false, `data-id="${id}"`) : ""}</div>`,
    )
    .join(
      "",
    )}</div><div class="account-device-footer"><p>退出设备不会解除 Token 绑定。</p>${button("退出全部设备", "logout-all")}</div>`;
}
function home() {
  const binding = currentBinding();
  if (!binding?.valid)
    return `<section class="account-page"><div class="account-empty"><span class="token-mark">${icon("key")}</span><h3>${binding ? "当前 Token 已失效" : "选择一个 Token"}</h3><p>${binding ? "前往账号与凭据，选择其他 Token 或重新绑定。" : "从已绑定的 Token 中选择一个，继续读取仓库。"}</p>${button("管理 Token", "account", true)}</div></section>`;
  return `<section class="account-page"><div class="intro"><div><h1>我的仓库</h1><p>当前使用「${esc(binding.label)}」的读取权限。</p></div>${button("管理 Token", "account")}</div>${tokens[binding.token].repos.map((name) => `<a class="repo-row" href="#reading" data-action="reading"><div class="row"><span class="repo-symbol">${name[0].toUpperCase()}</span><div><strong>${name}</strong><p class="repo-meta mono">example / ${name}</p></div></div>${badge("可阅读")}${icon("chevron")}</a>`).join("")}<p class="account-hint">示例仓库，仅用于演示账号与 Token 流程。</p></section>`;
}
function reading() {
  return `<section class="account-page"><article class="document"><div class="doc-byline">SPEC · 示例记录</div><h1>工程记录</h1><p>当前账号：${esc(currentAccount().username)}。</p><p>当前凭据：${esc(currentBinding().label)}。</p><h2>继续阅读</h2><p>每个浏览器可以选择不同的 Token。换个浏览器登录同一账号后，仍能从绑定列表中选择使用。</p></article></section>`;
}
function render() {
  $("#app").innerHTML = shell(
    !currentAccount()
      ? auth()
      : ui.route === "home"
        ? home()
        : ui.route === "reading" && currentBinding()?.valid
          ? reading()
          : accountPage(),
  );
  document
    .querySelectorAll("[data-browser]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.browser === browserId)),
    );
  document.querySelectorAll('[role="tab"]').forEach((tab) => {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
  });
  const form = $("#auth-form");
  if (form) wireForm(form, submitAuth);
}
function wireForm(form, submit) {
  form.onsubmit = submit;
  // The preview sandbox allows scripts but blocks native form submission.
  const run = (event) => {
    event.preventDefault();
    submit({ preventDefault() {}, currentTarget: form });
  };
  form.querySelector('button[type="submit"]').onclick = run;
  form.onkeydown = (event) => {
    if (event.key === "Enter" && event.target.matches("input")) run(event);
  };
}
function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const username = $("#username").value.trim(),
    password = $("#password").value,
    confirm = $("#confirm-password")?.value;
  form
    .querySelectorAll('input[type="password"], #password')
    .forEach((input) => (input.value = ""));
  const found = accounts.find((a) => normal(a.username) === normal(username));
  const error =
    !username || /[\x00-\x1f\x7f]/.test(username)
      ? "请填写有效的账号。"
      : ui.register && found
        ? "这个账号已被使用，请换一个。"
        : ui.register && confirm !== password
          ? "两次填写的密码不一致。"
          : !ui.register && (!found || found.password !== password)
            ? "账号或密码不正确。"
            : "";
  if (error) {
    $("#auth-error").textContent = error;
    return;
  }
  const account = ui.register
    ? { id: `account-${++nextId}`, username, password, bindings: [] }
    : found;
  if (ui.register) accounts.push(account);
  Object.assign(currentDevice(), { accountId: account.id, activeId: null });
  generation++;
  Object.assign(ui, {
    route: "account",
    tab: "tokens",
    error: "",
    register: false,
    busy: false,
  });
  render();
  focusHeading();
  toast("已登录，可以选择或添加 Token。");
}
function closeDialog() {
  const dialog = $("#dialog");
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
  dialogState = null;
  if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
}
function showDialog(type, id = "") {
  const binding = bindings().find((b) => b.id === id),
    account = currentAccount();
  if (!account) return;
  document
    .querySelectorAll(".token-menu[open]")
    .forEach((m) => (m.open = false));
  dialogTrigger = document.activeElement;
  dialogState = { type, id, accountId: account.id, browserId };
  const dialog = $("#dialog");
  const title =
    type === "add"
      ? "添加 Token"
      : type === "rename"
        ? "重命名 Token"
        : type === "copy"
          ? "复制当前 Token"
          : type === "remove"
            ? "解除 Token 绑定？"
            : type === "revoke"
              ? "退出此设备？"
              : "退出全部设备？";
  const form = type === "add" || type === "rename";
  let content = "";
  if (type === "add")
    content = `<p>绑定到账号「${esc(account.username)}」，其他浏览器登录后也可使用。</p><div class="platform-line"><span class="token-mark">${icon("github")}</span><div><strong>GitHub</strong><span>github.com</span></div></div><label for="token-label">显示名称 <span class="muted">（可选）</span></label><input id="token-label" maxlength="100" placeholder="例如：日常项目"><label for="token-value">Token</label><input id="token-value" type="password" autocomplete="off" placeholder="demo 或 demo-work" required aria-describedby="token-help"><p class="form-help" id="token-help">仅接受示例 Token，请勿填写真实凭据。</p>`;
  if (type === "rename")
    content = `<label for="token-label">显示名称</label><input id="token-label" maxlength="100" value="${esc(binding.label)}" required>`;
  if (type === "copy")
    content = `<p>复制以下示例 Token。</p><input class="copy-field mono" id="copy-value" aria-label="当前示例 Token" readonly value="${currentBinding().token}">`;
  if (type === "remove")
    content = `<p>解除「${esc(binding.label)}」后，所有设备都将无法继续使用它。账号仍保持登录。</p>`;
  if (type === "revoke")
    content = `<p>退出「${esc(devices[id].label)}」的账号登录。已绑定的 Token 会保留。</p>`;
  if (type === "logout-all")
    content = `<p>账号「${esc(account.username)}」的所有设备都将退出，已绑定的 Token 会保留。</p>`;
  dialog.className = "account-dialog";
  dialog.innerHTML = `${form ? '<form id="token-form">' : ""}<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-btn" data-action="close" aria-label="关闭">${icon("close")}</button></div>${content}<p class="form-error" id="dialog-error" role="alert"></p><div class="dialog-actions">${type === "copy" ? button("完成", "close", true, 'type="button"') : `${button("取消", "close", false, 'type="button"')}<button class="btn ${form ? "primary" : "danger-primary"}" ${form ? 'type="submit"' : 'type="button" data-action="confirm-dialog"'}>${type === "add" ? "绑定并使用" : type === "rename" ? "保存名称" : type === "remove" ? "解除绑定" : type === "revoke" ? "退出此设备" : "退出全部设备"}</button>`}</div>${form ? "</form>" : ""}`;
  dialog.showModal();
  if (form) wireForm($("#token-form"), submitToken);
  if (type === "copy") $("#copy-value").select();
  if (type === "rename") $("#token-label").select();
}
function submitToken(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !validDialog()) return;
  const { type, id } = dialogState,
    account = currentAccount(),
    label = $("#token-label").value.trim();
  if (type === "rename") {
    if (!label) {
      $("#dialog-error").textContent = "请填写显示名称。";
      return;
    }
    account.bindings.find((b) => b.id === id).label = label;
    closeDialog();
    render();
    toast("名称已保存。");
    return;
  }
  const token = $("#token-value").value.trim();
  $("#token-value").value = "";
  if (!Object.hasOwn(tokens, token)) {
    $("#dialog-error").textContent = "仅接受示例 Token demo 或 demo-work。";
    return;
  }
  let binding = account.bindings.find((b) => b.token === token),
    duplicate = !!binding;
  if (binding && !binding.valid) {
    $("#dialog-error").textContent =
      "这条 Token 已失效，请解除绑定后重新添加。";
    return;
  }
  if (!binding) {
    binding = {
      id: `binding-${++nextId}`,
      label: label || tokens[token].login,
      token,
      valid: true,
    };
    account.bindings.push(binding);
  } else if (label) binding.label = label;
  currentDevice().activeId = binding.id;
  ui.busy = false;
  ui.error = "";
  generation++;
  closeDialog();
  render();
  toast(
    duplicate
      ? "已选用已有 Token，未重复添加。"
      : "Token 已绑定，可以开始阅读。",
  );
}
function validDialog() {
  return (
    dialogState &&
    dialogState.browserId === browserId &&
    dialogState.accountId === currentAccount()?.id
  );
}
function confirmDialog() {
  if (!validDialog()) {
    closeDialog();
    return;
  }
  const { type, id } = dialogState,
    account = currentAccount();
  if (type === "remove") {
    account.bindings = account.bindings.filter((b) => b.id !== id);
    Object.values(devices).forEach((d) => {
      if (d.accountId === account.id && d.activeId === id) d.activeId = null;
    });
  } else if (type === "revoke")
    Object.assign(devices[id], { accountId: null, activeId: null });
  else if (type === "logout-all")
    Object.values(devices).forEach((d) => {
      if (d.accountId === account.id)
        Object.assign(d, { accountId: null, activeId: null });
    });
  generation++;
  closeDialog();
  ui.error = "";
  ui.busy = false;
  render();
  toast(
    type === "remove"
      ? "已解除绑定，所有设备同步生效。"
      : "已退出，Token 仍保留在账号中。",
  );
}
async function selectBinding(id) {
  const binding = bindings().find((b) => b.id === id),
    accountId = currentAccount()?.id;
  if (!binding || ui.busy) return;
  const started = ++generation,
    deviceId = browserId;
  ui.busy = id;
  ui.error = "";
  ui.failedId = "";
  render();
  await new Promise((resolve) => setTimeout(resolve, 230));
  if (
    generation !== started ||
    browserId !== deviceId ||
    currentAccount()?.id !== accountId ||
    !bindings().includes(binding)
  )
    return;
  ui.busy = false;
  if (ui.network) {
    ui.error = "暂时无法验证 Token，当前选择已保留。";
    ui.failedId = id;
  } else if (!binding.valid)
    ui.error = "Token 已失效，请解除绑定后重新添加，或选择其他 Token。";
  else {
    currentDevice().activeId = id;
    toast(`当前浏览器已使用「${binding.label}」。`);
  }
  render();
}
async function copyToken() {
  const binding = currentBinding(),
    started = generation;
  if (!binding) return;
  try {
    await navigator.clipboard.writeText(binding.token);
    if (generation === started) toast("示例 Token 已复制。");
  } catch {
    if (generation === started) showDialog("copy");
  }
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  event.preventDefault();
  const action = target.dataset.action,
    id = target.dataset.id;
  if (["login-mode", "register-mode"].includes(action)) {
    ui.register = action === "register-mode";
    ui.error = "";
    render();
    return;
  }
  if (action === "show-password") {
    const input = $("#password");
    input.type = input.type === "password" ? "text" : "password";
    target.setAttribute("aria-pressed", String(input.type === "text"));
    target.setAttribute(
      "aria-label",
      input.type === "text" ? "隐藏密码" : "显示密码",
    );
    return;
  }
  if (action === "close") {
    closeDialog();
    return;
  }
  if (action === "confirm-dialog") {
    confirmDialog();
    return;
  }
  if (!currentAccount()) {
    ui.register = false;
    ui.error = "";
    render();
    return;
  }
  if (["add", "rename", "remove", "revoke", "logout-all"].includes(action)) {
    showDialog(action, id);
    return;
  }
  if (action === "copy") {
    void copyToken();
    return;
  }
  if (action === "select") {
    void selectBinding(id);
    return;
  }
  if (action === "retry-switch") {
    ui.network = false;
    void selectBinding(ui.failedId);
    return;
  }
  if (action === "logout") {
    Object.assign(currentDevice(), { accountId: null, activeId: null });
    generation++;
    Object.assign(ui, { busy: false, error: "", register: false });
    render();
    toast("已退出，Token 仍保留在账号中。");
    return;
  }
  ui.error = "";
  if (["account", "tokens", "devices"].includes(action)) {
    ui.route = "account";
    ui.tab = action === "devices" ? "devices" : "tokens";
  } else if (["home", "reading"].includes(action)) ui.route = action;
  render();
  focusHeading();
});
document.querySelectorAll("[data-browser]").forEach((button) =>
  button.addEventListener("click", () => {
    if (browserId === button.dataset.browser) return;
    generation++;
    closeDialog();
    browserId = button.dataset.browser;
    Object.assign(ui, {
      route: "account",
      tab: "tokens",
      busy: false,
      error: "",
      failedId: "",
      register: false,
    });
    render();
    focusHeading();
  }),
);
$("#scenario").addEventListener("change", (event) => reset(event.target.value));
$("#dialog").addEventListener("close", () => {
  if (!$("#dialog").open) closeDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape")
    document
      .querySelectorAll(".token-menu[open]")
      .forEach((menu) => (menu.open = false));
  if (
    event.target.matches('[role="tab"]') &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  ) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "tokens"
        : event.key === "End"
          ? "devices"
          : ui.tab === "tokens"
            ? "devices"
            : "tokens";
    $(`#${next}-tab`).click();
    $(`#${next}-tab`).focus();
  }
});
const initial = location.hash.slice(1);
reset(
  [...$("#scenario").options].some((option) => option.value === initial)
    ? initial
    : "tokens",
);
