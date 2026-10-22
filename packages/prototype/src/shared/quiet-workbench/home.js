// ① 我的仓库：可阅读的仓库直接列出，需要处理的仓库单独成组。
function homeView() {
  const t = currentToken();
  const head = (sub, actions = btn("添加仓库", "add-repo", { icon: "plus" })) =>
    `<header class="page-head"><div class="stack"><h1>我的仓库</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div><div class="head-actions">${actions}</div></header>`;
  const wrap = (inner) => ({ body: `<div class="page" data-scroll="home"><div class="page-inner">${inner}</div></div>` });
  if (S.scene === "loading") return { body: skeleton() };
  if (S.scene === "no-token" || !t)
    return wrap(head("", "") + `<div class="onboard">${icon("key", "onboard-icon")}<h2>绑定一个 GitHub Token</h2><p>OpenFolio 用你的 Token 读取有权限的仓库，并只列出已接入 SpecTrail 的项目。Token 随账号保存，换浏览器登录后也能直接使用。</p><div class="empty-actions">${btn("添加 Token", "add-token", { kind: "primary", icon: "plus" })}${btn("所需权限", "token-help", { kind: "ghost", key: "token-help-home" })}</div></div>`);
  if (S.scene === "empty")
    return wrap(head("") + empty("没有发现接入 SpecTrail 的仓库", `已检查 Token「${esc(t.name)}」可读取的 40 个仓库。如果仓库刚完成接入，可以直接输入地址检查。`, btn("输入仓库地址", "add-repo", { kind: "primary", key: "add-repo-empty" }) + btn("重新发现", "refresh", { icon: "refresh", key: "rediscover" }), "folder"));
  const list = [...REPOS, ...(S.moreRepos ? MORE_REPOS : [])];
  const ready = list.filter((r) => r.status === "ready"),
    issues = list.filter((r) => r.status !== "ready");
  const row = (r) =>
    `<li><a class="repo-row" href="#/specs" data-action="open-repo" data-arg="${r.id}" data-key="repo:${r.id}">${mono(r, "lg")}<span class="grow stack"><span class="repo-name">${esc(r.name)}${r.id === "atlas" ? tag("上次阅读") : ""}</span><small class="repo-path"><span>${esc(r.owner)}/${esc(r.repo)}</span>${icon("branch")}<span>${esc(r.branch)}</span></small></span>${icon("right", "faint row-chevron")}</a></li>`;
  const issueRow = (r) =>
    `<li class="repo-row issue">${mono(r, "lg muted-mark")}<span class="grow stack"><span class="repo-name">${esc(r.name)}</span><small class="repo-reason">${icon(r.status === "denied" ? "lock" : "warning")}${esc(r.reason)}</small></span>${r.status === "denied" ? btn("切换 Token", "account-menu-proxy", { kind: "sm", key: `fix:${r.id}` }) : btn("重新检查", "recheck", { kind: "sm", arg: r.id })}</li>`;
  const status =
    S.scene === "discovering"
      ? `<div class="banner" role="status">${icon("refresh", "spin")}<span class="grow">正在发现仓库 · 已检查 18 / 40</span><span class="meter" aria-hidden="true"><i style="width:45%"></i></span></div>`
      : S.scene === "partial"
        ? `<div class="banner warn" role="status">${icon("warning")}<span class="grow">有 3 个仓库暂时无法检查（GitHub 限流），其余结果已显示。</span>${btn("重试", "refresh", { kind: "sm", key: "partial-retry" })}</div>`
        : offlineBanner();
  return wrap(
    head(`${ready.length} 个可阅读 · 由 Token「${esc(t.name)}」发现`) +
      status +
      `<ul class="repo-list" role="list">${ready.map(row).join("")}</ul>` +
      (S.moreRepos ? "" : `<div class="list-more">${btn("加载更多", "more-repos", { kind: "ghost" })}</div>`) +
      (issues.length ? `<section class="issue-group" aria-labelledby="issues-h"><h2 class="section-h" id="issues-h">需要处理 <span class="count">${issues.length}</span></h2><ul class="repo-list" role="list">${issues.map(issueRow).join("")}</ul></section>` : ""),
  );
}
A["open-repo"] = (el) => {
  S.repo = el.dataset.arg;
  S.scroll = {};
  go(specsPath());
};
A["more-repos"] = () => {
  S.moreRepos = true;
  render();
};
A["recheck"] = (el) => {
  el.disabled = true;
  el.innerHTML = `${icon("refresh", "spin")}<span>检查中</span>`;
  setTimeout(() => {
    render();
    toast("配置仍不一致：workflow.json 缺少 integrationBranch", "error");
  }, 800);
};
A["token-help"] = (el) =>
  openPop(el, () => `<div class="pop-pad"><div class="pop-title">Token 所需权限</div><p class="pop-text">建议使用 Fine-grained token，只授予需要阅读的仓库：</p><ul class="pop-list"><li><code>Contents</code> 只读：读取 Specs、Changes 与原型</li><li><code>Pull requests</code> 只读：显示交付进度</li><li><code>Metadata</code> 只读：GitHub 默认包含</li></ul></div>`, { label: "Token 所需权限" });
function addRepoDialog(result = "") {
  return `<div class="dlg-body" data-form="check-repo"><h2 class="dlg-title">添加仓库</h2><p class="muted">输入 GitHub 仓库的 HTTPS 地址，用当前 Token 检查读取权限与 SpecTrail 配置。</p><label class="field"><span>仓库地址</span><input class="input" id="repo-url" data-key="repo-url" data-autofocus placeholder="https://github.com/owner/repo" autocomplete="off" spellcheck="false"></label>${result}<div class="dlg-actions">${btn("取消", "close-dialog", { kind: "ghost" })}${btn("检查", "check-repo", { kind: "primary" })}</div></div>`;
}
A["add-repo"] = () => openDialog(addRepoDialog(), { label: "添加仓库" });
A["check-repo"] = () => {
  const input = $("#repo-url"),
    value = input.value.trim();
  const show = (html) => {
    updateDialog(addRepoDialog(html));
    $("#repo-url").value = value;
  };
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(value)) return show(`<p class="field-error" role="alert">${icon("alert")}请输入 https://github.com/owner/repo 形式的地址。</p>`);
  show(`<p class="field-note" role="status">${icon("refresh", "spin")}正在检查…</p>`);
  setTimeout(() => {
    if (/atlas|folio/.test(value)) show(`<div class="check-result ok" role="status">${icon("done")}<div class="stack"><strong>可以阅读</strong><small>在 develop 找到 SpecTrail 配置。</small></div>${btn("进入仓库", "open-checked", { kind: "sm primary", arg: /folio/.test(value) ? "folio" : "atlas" })}</div>`);
    else if (/design-kit/.test(value)) show(`<div class="check-result warn" role="status">${icon("warning")}<div class="stack"><strong>配置需要核对</strong><small>workflow.json 缺少 integrationBranch。完成 SpecTrail Setup 后再检查。</small></div></div>`);
    else show(`<div class="check-result bad" role="alert">${icon("lock")}<div class="stack"><strong>无法读取</strong><small>仓库不存在，或 Token「${esc(currentToken()?.name || "")}」没有读取权限。</small></div></div>`);
  }, 650);
};
A["open-checked"] = (el) => {
  closeDialog();
  S.repo = el.dataset.arg;
  go(specsPath());
};
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const form = event.target.closest?.("[data-form]");
  if (!form || event.target.tagName !== "INPUT") return;
  event.preventDefault();
  A[form.dataset.form]?.();
});
