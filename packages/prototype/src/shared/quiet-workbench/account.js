// ⑤ 账号与 Token：账号密码登录，Token 归属账号，设备按账号管理。
function accountView() {
  if (S.scene === "loading") return { body: skeleton() };
  const tokens = S.scene === "no-token" ? [] : S.tokens;
  const invalid = S.scene === "token-invalid";
  const tokenRow = (t) => {
    const cur = t.id === S.token;
    return `<li class="set-row">${icon("key", "row-icon")}<span class="grow stack"><span class="row-name">${esc(t.name)}${cur ? tag("当前使用", "accent") : ""}${invalid && cur ? tag("已失效", "red") : ""}</span><small>${t.platform} · ${esc(t.login)} · ${t.added}添加</small></span>${invalid && cur ? btn("重新绑定", "add-token", { kind: "sm", key: `rebind:${t.id}` }) : cur ? "" : btn("使用", "use-token", { kind: "sm", arg: t.id })}${ibtn(`${t.name} 的更多操作`, "token-more", "more", { arg: t.id, popup: "menu", tip: false })}</li>`;
  };
  const dev = (d) => `<li class="set-row">${icon(d.kind, "row-icon")}<span class="grow stack"><span class="row-name">${esc(d.name)}${d.current ? tag("此设备") : ""}</span><small>${d.last} · ${d.since}</small></span>${d.current ? "" : btn("退出", "revoke-device", { kind: "sm", arg: d.id })}</li>`;
  return {
    body: `<div class="page" data-scroll="account"><div class="page-inner narrow">
      <header class="page-head"><h1>账号与 Token</h1></header>${offlineBanner()}
      <section class="set-card" aria-labelledby="acc-h"><div class="set-account">${avatar(ACCOUNT.person, "xl")}<span class="grow stack"><strong id="acc-h">${ACCOUNT.username}</strong><small>OpenFolio 账号 · 10 月 8 日注册</small></span>${btn("退出登录", "sign-out-confirm", { kind: "sm" })}</div></section>
      <section class="set-section" aria-labelledby="tok-h"><div class="set-h"><div class="stack"><h2 id="tok-h">Token</h2><p>随账号保存。在任何浏览器登录后都可以直接选用，不需要再次输入。</p></div>${btn("添加 Token", "add-token", { icon: "plus", kind: "sm", key: "add-token-head" })}</div>
        ${invalid ? `<div class="banner bad">${icon("alert")}<span class="grow">GitHub 拒绝了「日常阅读」：Token 已过期或被撤销。账号仍保持登录，其他 Token 不受影响。</span></div>` : ""}
        ${tokens.length ? `<ul class="set-list" role="list">${tokens.map(tokenRow).join("")}</ul>` : `<div class="set-empty">${icon("key")}<div class="stack"><strong>还没有绑定 Token</strong><small>添加一个 GitHub Token 后才能发现和阅读仓库。</small></div>${btn("添加 Token", "add-token", { kind: "sm primary", key: "add-token-empty" })}</div>`}
      </section>
      <section class="set-section" aria-labelledby="dev-h"><div class="set-h"><div class="stack"><h2 id="dev-h">登录设备</h2><p>退出设备只结束登录，账号的 Token 会保留。</p></div></div><ul class="set-list" role="list">${S.devices.map(dev).join("")}</ul>
        <div class="set-danger"><span class="grow stack"><strong>退出全部设备</strong><small>包括这台设备。之后需要重新输入账号和密码。</small></span>${btn("退出全部设备", "sign-out-all", { kind: "sm danger" })}</div></section>
    </div></div>`,
  };
}
A["use-token"] = (el) => {
  const id = el.dataset.arg,
    t = S.tokens.find((x) => x.id === id);
  closePop(false);
  if (S.scene === "switch-failed") return toast(`没能切换到「${t.name}」：GitHub 暂时无响应，仍在使用「${currentToken().name}」`, "error");
  S.token = id;
  S.scroll = {};
  render();
  toast(`正在使用「${t.name}」`);
};
A["token-more"] = (el) =>
  openPop(el, () => {
    const t = S.tokens.find((x) => x.id === el.dataset.arg),
      cur = t.id === S.token;
    return `<div class="menu" role="menu" aria-label="${esc(t.name)}"><button class="menu-item" role="menuitem" data-action="rename-token" data-arg="${t.id}" data-key="rename:${t.id}">${icon("pencil")}<span class="grow">重命名</span></button><button class="menu-item" role="menuitem" data-action="copy-token" data-arg="${t.id}" data-key="copytok:${t.id}" ${cur ? "" : "disabled"}>${icon("copy")}<span class="grow stack"><span>复制 Token</span>${cur ? "" : "<small>先设为当前使用</small>"}</span></button><div class="menu-sep"></div><button class="menu-item danger" role="menuitem" data-action="unbind-token" data-arg="${t.id}" data-key="unbind:${t.id}">${icon("unlink")}<span class="grow">解绑</span></button></div>`;
  }, { align: "end", label: "Token 操作" });
A["copy-token"] = () => {
  closePop();
  copyText("ghp_demo_0f3K9xExampleOnly", "Token");
};
A["rename-token"] = (el) => {
  const t = S.tokens.find((x) => x.id === el.dataset.arg);
  openDialog(`<div class="dlg-body" data-form="save-name"><h2 class="dlg-title">重命名 Token</h2><label class="field"><span>名称</span><input class="input" id="token-name" data-autofocus data-select value="${esc(t.name)}" maxlength="40" data-arg="${t.id}"></label><div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("保存", "save-name", { kind: "primary" })}</div></div>`, { label: "重命名 Token" });
};
A["save-name"] = () => {
  const input = $("#token-name"),
    t = S.tokens.find((x) => x.id === input.dataset.arg);
  t.name = input.value.trim() || t.name;
  closeDialog();
  render();
  toast("已重命名");
};
A["unbind-token"] = (el) => {
  const t = S.tokens.find((x) => x.id === el.dataset.arg);
  openDialog(`<div class="dlg-body"><h2 class="dlg-title">解绑「${esc(t.name)}」？</h2><p class="muted">账号的所有浏览器都将不能再使用这个 Token。${t.id === S.token ? "正在使用它的设备会回到选择 Token 的状态。" : ""}之后可以重新添加。</p><div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("解绑", "confirm-unbind", { kind: "danger-fill", arg: t.id })}</div></div>`, { label: "解绑 Token" });
};
A["confirm-unbind"] = (el) => {
  S.tokens = S.tokens.filter((x) => x.id !== el.dataset.arg);
  if (S.token === el.dataset.arg) S.token = S.tokens[0]?.id || null;
  closeDialog();
  render();
  toast("已解绑");
};
function addTokenDialog(error = "") {
  return `<div class="dlg-body" data-form="save-token"><h2 class="dlg-title">添加 Token</h2><p class="muted">建议使用 Fine-grained token，只授予需要阅读的仓库：Contents 与 Pull requests 只读。示例中可输入 <code>demo</code>。</p><label class="field"><span>名称<em>可选</em></span><input class="input" id="tok-label" placeholder="例如：团队仓库" maxlength="40" data-key="tok-label" data-autofocus></label><label class="field"><span>GitHub Token</span><input class="input" id="tok-value" type="password" autocomplete="off" placeholder="github_pat_…" data-key="tok-value" ${error ? 'aria-invalid="true" aria-describedby="tok-err"' : ""}></label>${error}<div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("验证并添加", "save-token", { kind: "primary" })}</div></div>`;
}
A["add-token"] = () => openDialog(addTokenDialog(), { label: "添加 Token" });
A["save-token"] = () => {
  const label = $("#tok-label").value.trim(),
    value = $("#tok-value").value.trim();
  if (!value) return updateDialog(addTokenDialog(`<p class="field-error" id="tok-err" role="alert">${icon("alert")}请输入 Token。</p>`));
  const save = $('[data-action="save-token"]');
  save.disabled = true;
  save.innerHTML = `${icon("refresh", "spin")}<span>正在验证</span>`;
  setTimeout(() => {
    if (!/^demo(-work)?$/.test(value)) {
      updateDialog(addTokenDialog(`<p class="field-error" id="tok-err" role="alert">${icon("alert")}GitHub 拒绝了这个 Token。请确认没有过期并具有 Contents 只读权限。</p>`));
      $("#tok-label").value = label;
      return;
    }
    const id = "t" + Date.now();
    S.tokens.push({ id, name: label || "新 Token", login: "demo-lin", platform: "GitHub", added: "今天" });
    S.token = id;
    if (["no-token", "token-invalid"].includes(S.scene)) S.scene = "normal";
    closeDialog();
    history.replaceState(null, "", hashFor(S.path.join("/")));
    render();
    toast("已添加并开始使用");
  }, 700);
};
A["revoke-device"] = (el) => {
  const d = S.devices.find((x) => x.id === el.dataset.arg);
  openDialog(`<div class="dlg-body"><h2 class="dlg-title">退出「${esc(d.name)}」？</h2><p class="muted">该设备需要重新登录。账号的 Token 会保留。</p><div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("退出", "confirm-revoke", { kind: "danger-fill", arg: d.id })}</div></div>`, { label: "退出设备" });
};
A["confirm-revoke"] = (el) => {
  S.devices = S.devices.filter((x) => x.id !== el.dataset.arg);
  closeDialog();
  render();
  toast("设备已退出");
};
A["sign-out-confirm"] = () =>
  openDialog(`<div class="dlg-body"><h2 class="dlg-title">退出这台设备？</h2><p class="muted">账号的 Token 与其他设备不受影响。</p><div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("退出登录", "sign-out", { kind: "danger-fill" })}</div></div>`, { label: "退出登录" });
A["sign-out-all"] = () =>
  openDialog(`<div class="dlg-body"><h2 class="dlg-title">退出全部 ${S.devices.length} 台设备？</h2><p class="muted">包括这台设备。账号的 Token 会保留，重新登录后可以直接使用。</p><div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("全部退出", "sign-out", { kind: "danger-fill", key: "sign-out-all-confirm" })}</div></div>`, { label: "退出全部设备" });

// 登录与注册：独立页面，不显示工作台导航。
function authView() {
  const reg = route() === "register",
    s = S.scene,
    expired = s === "expired";
  const err =
    s === "wrong-password" ? `<p class="field-error" role="alert">${icon("alert")}账号或密码不正确。</p>`
    : s === "rate-limited" ? `<p class="field-error" role="alert">${icon("clock")}连续失败次数过多，请 5 分钟后再试。</p>`
    : s === "duplicate" && reg ? `<p class="field-error" role="alert">${icon("alert")}账号 lin 已被使用，换一个试试。</p>`
    : "";
  return `<div class="auth"><div class="auth-card" role="main" id="main" tabindex="-1">${brandMark("auth-mark")}<h1>${reg ? "创建 OpenFolio 账号" : "登录 OpenFolio"}</h1><p class="muted">${reg ? "账号和密码由你自己设置，登录后再绑定 GitHub Token。" : expired ? "登录已过期，私有内容已清除。请重新登录。" : "阅读你参与的项目：Specs、Changes 与原型。"}</p><div class="auth-form" data-form="${reg ? "do-register" : "do-login"}"><label class="field"><span>账号</span><input class="input" id="auth-user" autocomplete="username" data-autofocus data-key="auth-user" value="${reg ? "" : "lin"}" ${err && !reg ? 'aria-invalid="true"' : ""}></label><label class="field"><span>密码${reg ? "<em>8 位以上</em>" : ""}</span><input class="input" id="auth-pass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" data-key="auth-pass" ${err ? 'aria-invalid="true"' : ""}></label>${reg ? `<label class="field"><span>确认密码</span><input class="input" id="auth-pass2" type="password" autocomplete="new-password" data-key="auth-pass2"></label>` : ""}${err}${btn(reg ? "注册并登录" : "登录", reg ? "do-register" : "do-login", { kind: "primary block", disabled: s === "rate-limited" })}</div><p class="auth-switch">${reg ? "已有账号？" : "还没有账号？"}<a href="#/${reg ? "login" : "register"}" data-action="auth-switch" data-arg="${reg ? "login" : "register"}" data-key="auth-switch">${reg ? "登录" : "注册"}</a></p>${reg ? "" : `<p class="auth-hint">示例账号 lin，密码 demo12345</p>`}</div></div>`;
}
A["auth-switch"] = (el) => {
  S.scene = "normal";
  go(el.dataset.arg);
};
A["do-login"] = () => {
  const u = $("#auth-user").value.trim(),
    p = $("#auth-pass").value;
  if (S.scene === "rate-limited") return;
  if (u !== "lin" || p !== "demo12345") {
    S.scene = "wrong-password";
    render();
    $("#auth-pass").value = "";
    $("#auth-pass").focus();
    return;
  }
  S.signedIn = true;
  S.scene = "normal";
  go("home");
};
A["do-register"] = () => {
  const u = $("#auth-user").value.trim(),
    p = $("#auth-pass").value,
    p2 = $("#auth-pass2").value;
  const fail = (msg) => {
    $(".field-error")?.remove();
    $(".auth-form .btn").insertAdjacentHTML("beforebegin", `<p class="field-error" role="alert">${icon("alert")}${msg}</p>`);
  };
  if (!u) return fail("请输入账号。");
  if (u.toLowerCase() === "lin" || S.scene === "duplicate") return fail(`账号 ${esc(u)} 已被使用，换一个试试。`);
  if (p.length < 8) return fail("密码至少需要 8 位。");
  if (p !== p2) return fail("两次输入的密码不一致。");
  S.signedIn = true;
  S.scene = "no-token";
  S.tokens = [];
  S.token = null;
  go("home");
};
