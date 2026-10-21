// ④ 原型：缩略图打开预览，卡片其余区域打开详情；画布按设备真实尺寸绘制后缩放。
function mock(p, w, h) {
  const wide = w >= 900,
    phone = w < 560;
  const nav = (on) => (wide ? `<aside class="mk-nav"><b class="mk-logo"><i></i>Atlas</b>${["行程", "离线地图", "费用"].map((x) => `<span class="${x === on ? "on" : ""}">${x}</span>`).join("")}<span class="mk-me">林</span></aside>` : `<header class="mk-top"><b class="mk-logo"><i></i>Atlas</b><span class="mk-me">林</span></header>`);
  const tab = phone ? `<nav class="mk-tabs"><span>行程</span><span class="on">地图</span><span>费用</span></nav>` : "";
  if (p.id === "home-widget")
    return `<div class="mk mk-widget" style="width:${w}px;height:${h}px"><div class="mk-w-top"><b class="mk-logo"><i></i>下一站</b><span>14:30 出发</span></div><strong>伏见稻荷大社</strong><p>步行 12 分钟 · 还有 2 小时</p><div class="mk-w-bar"><i style="width:62%"></i></div><small>京都秋季行 · 第 2 天</small></div>`;
  const map = `<svg class="mk-mapsvg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="600" height="600" fill="#e9eee6"/><path d="M0 430 C110 400 170 470 290 440 S470 360 600 400 V600 H0Z" fill="#cfe2ec"/><path d="M380 0 C360 80 420 140 400 220 S430 330 470 360" stroke="#cfe2ec" stroke-width="18" fill="none"/><g fill="#dfe8d6"><rect x="40" y="60" width="90" height="70" rx="10"/><rect x="460" y="120" width="100" height="80" rx="10"/><rect x="90" y="300" width="70" height="60" rx="10"/></g><g stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"><path d="M0 170 C160 160 300 120 600 80"/><path d="M120 600 L330 0"/><path d="M0 330 C200 300 380 330 600 270"/></g><g stroke="#f7f4ec" stroke-width="3.5" fill="none"><path d="M220 0 V600"/><path d="M520 0 V600"/><path d="M0 240 H600"/><path d="M0 520 H600"/></g><rect x="150" y="150" width="190" height="170" rx="14" fill="rgba(14,138,122,.14)" stroke="#0e8a7a" stroke-width="3"/><rect x="290" y="210" width="190" height="150" rx="14" fill="rgba(217,119,6,.12)" stroke="#d97706" stroke-width="3" stroke-dasharray="10 7"/><circle cx="245" cy="235" r="10" fill="#0e8a7a" stroke="#fff" stroke-width="4"/></svg>`;
  if (p.id === "offline-maps") {
    const rows = [["京都", "312 MB", "3 天前更新", "ok"], ["大阪", "286 MB", "下载中 64%", "busy"], ["东京 · 新宿", "420 MB", "62 天未更新，可能过期", "warn"]];
    return `<div class="mk ${wide ? "mk-wide" : ""}" style="width:${w}px;height:${h}px">${nav("离线地图")}<main class="mk-main">${phone ? `<div class="mk-map small">${map}</div>` : ""}<div class="mk-h"><h3>离线地图</h3><span class="mk-btn">＋ 下载区域</span></div><div class="mk-store"><span>已用 1.0 GB · 可用 18.4 GB</span><div class="mk-bar"><i style="width:22%"></i></div></div><div class="mk-list">${rows.map(([n, s, t, st]) => `<div class="mk-row"><span class="mk-dot ${st}"></span><div class="mk-col"><b>${n}</b><small>${t}</small>${st === "busy" ? `<div class="mk-bar thin"><i style="width:64%"></i></div>` : ""}</div><span class="mk-size">${s}</span></div>`).join("")}</div>${tab}</main>${phone ? "" : `<section class="mk-map">${map}<span class="mk-map-tip">框选范围 · 预计 214 MB</span></section>`}</div>`;
  }
  if (p.id === "expense-split") {
    const ppl = [["林", "+¥ 1,240", "pos"], ["陈", "−¥ 860", "neg"], ["周", "−¥ 380", "neg"]];
    const items = [["晚餐 · 先斗町", "¥ 18,600", "JPY", "林"], ["新干线车票", "¥ 1,920", "CNY", "陈"], ["寺庙门票", "¥ 4,200", "JPY", "周"], ["机场大巴", "$ 36.00", "USD", "林"]];
    return `<div class="mk ${wide ? "mk-wide" : ""}" style="width:${w}px;height:${h}px">${nav("费用")}<main class="mk-main"><div class="mk-h"><h3>京都秋季行 · 结算</h3><span class="mk-btn">记一笔</span></div><div class="mk-people">${ppl.map(([n, v, t]) => `<div class="mk-person"><span class="mk-me">${n}</span><b class="${t}">${v}</b></div>`).join("")}</div><div class="mk-list">${items.map(([n, v, cur, who]) => `<div class="mk-row"><span class="mk-me sm">${who}</span><div class="mk-col"><b>${n}</b><small>${cur} · 按记账日汇率</small></div><span class="mk-size">${v}</span></div>`).join("")}</div>${tab}</main></div>`;
  }
  if (p.id === "trip-share")
    return `<div class="mk mk-share" style="width:${w}px;height:${h}px"><div class="mk-hero"><small>只读分享 · 林知远</small><h3>京都秋季行</h3><p>10 月 30 日 – 11 月 4 日 · 3 人</p></div><div class="mk-days">${[["第 1 天", ["抵达关西机场", "入住 · 四条河原町", "晚餐 · 先斗町"]], ["第 2 天", ["伏见稻荷大社", "东福寺", "祇园散步"]], ["第 3 天", ["岚山竹林", "天龙寺", "嵯峨野小火车"]]].map(([d, xs]) => `<section class="mk-day"><b>${d}</b>${xs.map((x, i) => `<div class="mk-stop"><span>${["09:00", "13:30", "18:30"][i]}</span>${x}</div>`).join("")}</section>`).join("")}</div></div>`;
  return `<div class="mk ${wide ? "mk-wide" : ""}" style="width:${w}px;height:${h}px">${nav("行程")}<main class="mk-main"><div class="mk-h"><h3>京都秋季行</h3><span class="mk-btn">分享</span></div><div class="mk-cols">${["第 1 天 · 10/30", "第 2 天 · 10/31", "第 3 天 · 11/1"].slice(0, phone ? 1 : 3).map((d, n) => `<section class="mk-day"><b>${d}</b>${["机场到酒店", "伏见稻荷大社", "岚山竹林", "晚餐"].slice(n % 2, 4).map((x) => `<div class="mk-stop mk-card">${x}</div>`).join("")}<span class="mk-add">＋ 添加地点</span></section>`).join("")}</div>${tab}</main></div>`;
}
function protoSize(p, device, landscape) {
  if (p.kind === "component") return p.viewport;
  const [w, h] = DEVICE_SIZE[device];
  return landscape && device !== "pc-web" ? [h, w] : [w, h];
}
function protoCard(p) {
  const device = p.kind === "component" ? null : p.devices.includes(S.protoDevice) ? S.protoDevice : p.devices[0];
  const [w, h] = protoSize(p, device);
  const c = p.change && changeById(p.change);
  return `<article class="proto-card"><button class="thumb ${p.kind === "component" ? "component" : device}" data-action="open-viewer" data-arg="${p.id}" data-key="thumb:${p.id}" aria-label="预览 ${esc(p.title)}"><span class="thumb-stage" data-w="${w}" data-h="${h}">${mock(p, w, h)}</span></button><button class="card-body" data-action="proto-details" data-arg="${p.id}" data-key="card:${p.id}" aria-haspopup="dialog"><span class="card-title">${esc(p.title)}${p.kind === "component" ? tag("组件") : ""}</span><span class="card-desc">${esc(p.desc)}</span><span class="card-meta">${p.kind === "component" ? `<span class="faint">${p.viewport.join(" × ")}</span>` : `<span class="dev-icons" aria-label="${p.devices.map((d) => DEVICE_LABEL[d]).join("、")}">${p.devices.map((d) => icon(DEVICE_ICON[d])).join("")}</span>`}${c ? `<span class="card-change clamp">${icon("change")}${esc(c.title)}</span>` : ""}${S.publicReady[p.id] ? `<span class="pub-mark" title="已准备公开链接">${icon("globe")}</span>` : ""}</span></button></article>`;
}
function prototypesView() {
  if (S.path[1]) return viewerView(S.path[1]);
  const gate = sceneGate();
  if (gate) return gate;
  const items = prototypesOf();
  const wrap = (inner) => ({ body: `<div class="page" data-scroll="prototypes"><div class="page-inner wide">${inner}</div></div>` });
  if (S.scene === "empty" || !items.length) return wrap(`<header class="page-head"><h1>原型</h1></header>${empty("这个仓库还没有原型", "Change 发布原型并登记到当前清单后，会出现在这里。", "", "layout")}`);
  const shown = items.filter((p) => p.kind === "component" || p.devices.includes(S.protoDevice));
  return wrap(`<header class="page-head"><div class="stack"><h1>原型</h1><p class="sub">${items.length} 个 · ${Object.keys(S.publicReady).filter((k) => items.some((p) => p.id === k)).length} 个已公开</p></div></header>${offlineBanner()}<div class="list-bar"><div class="seg" role="radiogroup" aria-label="预览设备">${Object.keys(DEVICE_SIZE).map((d) => `<button role="radio" aria-checked="${S.protoDevice === d}" data-action="proto-device" data-arg="${d}" data-key="pd:${d}">${icon(DEVICE_ICON[d])}<span>${DEVICE_LABEL[d]}</span></button>`).join("")}</div></div><div class="proto-grid">${shown.map(protoCard).join("")}</div>`);
}
A["proto-device"] = (el) => {
  S.protoDevice = el.dataset.arg;
  render();
};
function fitThumb(stage) {
  const box = stage.parentElement,
    w = +stage.dataset.w,
    h = +stage.dataset.h;
  const scale = Math.min(box.clientWidth / w, box.clientHeight / h) * (box.classList.contains("pc-web") ? 1 : 0.86);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
A["open-viewer"] = (el) => {
  const p = protoById(el.dataset.arg);
  S.viewer = { device: p.kind === "component" ? null : p.devices.includes(S.protoDevice) ? S.protoDevice : p.devices[0], landscape: false, zoom: "fit", key: 0 };
  closeDialog();
  go(`prototypes/${p.id}`);
};
A["proto-details"] = (el) => {
  const p = protoById(el.dataset.arg),
    c = p.change && changeById(p.change);
  openDialog(`<div class="sheet-head"><span class="grow sheet-title">${esc(p.title)}</span>${ibtn("关闭", "close-dialog", "x", { tip: false })}</div><div class="sheet-body"><p>${esc(p.desc)}</p><dl class="kv wide"><dt>类型</dt><dd>${p.kind === "component" ? `组件 · ${p.viewport.join(" × ")}` : "页面"}</dd>${p.devices ? `<dt>适配</dt><dd>${p.devices.map((d) => DEVICE_LABEL[d]).join("、")}</dd>` : ""}<dt>固定版本</dt><dd><code>${p.version}</code></dd><dt>源码提交</dt><dd><code>${p.commit}</code></dd>${c ? `<dt>关联 Change</dt><dd><a href="#/changes/${c.id}" data-action="open-change" data-arg="${c.id}" data-key="detail-change">${esc(c.title)}</a></dd>` : ""}<dt>公开链接</dt><dd>${S.publicReady[p.id] ? `已准备 · ${S.publicReady[p.id] === true ? p.public : "刚刚"}` : "未准备"}</dd></dl><div class="sheet-actions">${btn("打开预览", "open-viewer", { kind: "primary", arg: p.id, key: "sheet-open" })}${btn(S.publicReady[p.id] ? "复制公开链接" : "准备公开链接", S.publicReady[p.id] ? "copy-public" : "prepare-public", { arg: p.id, icon: "globe", key: "sheet-public" })}</div></div>`, { cls: "sheet", label: p.title });
};
function viewerView(id) {
  const p = protoById(id);
  if (!p) return { body: `<div class="page"><div class="page-inner">${empty("没有找到这个原型", "它可能已从当前清单移除。", btn("返回原型", "go", { arg: "prototypes" }), "layout")}</div></div>` };
  const v = S.viewer;
  if (!v.device && p.kind !== "component") v.device = p.devices[0];
  const gate = ["denied", "error"].includes(S.scene) ? sceneGate() : null;
  const left = `<a class="back" href="#/prototypes" data-action="go" data-arg="prototypes" data-key="back-protos">${icon("arrowLeft")}<span>原型</span></a><span class="tb-title clamp">${esc(p.title)}</span>`;
  if (gate) return { ...gate, left };
  return {
    left,
    right: `${viewerTools(p)}${ibtn("公开链接", "public-menu", "globe", { popup: "dialog", arg: p.id, key: "public-menu" })}${ibtn("原型详情", "proto-details", "info", { arg: p.id, key: "viewer-info", popup: "dialog" })}`,
    body: `<div class="viewer">${offlineBanner()}${canvasArea(p, "viewer")}</div>`,
    noSync: mobile(),
    noAccount: true,
    hideRepo: mobile(),
  };
}
function viewerTools(p) {
  const v = S.viewer;
  return `${p.kind === "component" ? "" : `<span class="seg sm" role="radiogroup" aria-label="设备">${p.devices.map((d) => `<button role="radio" aria-checked="${v.device === d}" data-action="viewer-device" data-arg="${d}" data-key="vd:${d}" aria-label="${DEVICE_LABEL[d]}" data-tip="${DEVICE_LABEL[d]}">${icon(DEVICE_ICON[d])}</button>`).join("")}</span>`}${v.device && v.device !== "pc-web" ? ibtn("旋转", "viewer-rotate", "rotate", { pressed: String(v.landscape) }) : ""}${mobile() ? "" : `<span class="seg sm" role="radiogroup" aria-label="缩放"><button role="radio" aria-checked="${v.zoom === "fit"}" data-action="viewer-zoom" data-arg="fit" data-key="zoom:fit">适应</button><button role="radio" aria-checked="${v.zoom === "100"}" data-action="viewer-zoom" data-arg="100" data-key="zoom:100">100%</button></span>`}${ibtn("重新加载", "viewer-reload", "refresh")}`;
}
function canvasArea(p, key) {
  const v = S.viewer,
    [w, h] = protoSize(p, v.device, v.landscape);
  const inner =
    S.scene === "loading" ? `<div class="canvas-state" role="status">${icon("refresh", "spin")}<span>正在加载固定版本…</span></div>`
    : S.scene === "preview-error" ? `<div class="canvas-state">${icon("alert")}<span><strong>原型没有正常加载</strong><br>页面脚本报错：Cannot read properties of undefined。可以重新加载，或检查发布的版本。</span>${btn("重新加载", "viewer-reload", { kind: "sm", key: "reload-error" })}</div>`
    : `<div class="device ${p.kind === "component" ? "component" : v.device} ${v.landscape ? "landscape" : ""}" data-w="${w}" data-h="${h}" style="width:${w}px;height:${h}px">${mock(p, w, h)}</div>`;
  return `<div class="canvas ${v.zoom === "100" ? "actual" : ""}" data-canvas data-scroll="${key}-canvas" tabindex="0" aria-label="${esc(p.title)} 画布，${p.kind === "component" ? p.viewport.join("×") : DEVICE_LABEL[v.device] + " " + w + "×" + h}">${inner}</div><p class="canvas-caption">${p.kind === "component" ? "组件" : DEVICE_LABEL[v.device]} · ${w} × ${h} · ${v.zoom === "100" ? "100%" : "适应窗口"}</p>`;
}
function fitCanvas() {
  $$("[data-canvas]").forEach((canvas) => {
    const dev = $(".device", canvas);
    if (!dev) return;
    const w = +dev.dataset.w,
      h = +dev.dataset.h;
    if (canvas.classList.contains("actual")) {
      dev.style.transform = "none";
      dev.style.margin = "0 auto";
      return;
    }
    const pad = 32,
      scale = Math.min((canvas.clientWidth - pad) / w, (canvas.clientHeight - pad) / h, 1);
    dev.style.transform = `scale(${scale})`;
    dev.style.margin = `${Math.max(0, (canvas.clientHeight - h * scale) / 2)}px auto 0`;
    dev.style.marginBottom = `${h * scale - h}px`;
    dev.style.marginRight = dev.style.marginLeft = `${(canvas.clientWidth - w * scale) / 2}px`;
  });
}
A["viewer-device"] = (el) => {
  S.viewer.device = el.dataset.arg;
  S.viewer.landscape = false;
  render();
};
A["viewer-rotate"] = () => {
  S.viewer.landscape = !S.viewer.landscape;
  render();
};
A["viewer-zoom"] = (el) => {
  S.viewer.zoom = el.dataset.arg;
  render();
};
A["viewer-reload"] = () => {
  const prior = S.scene;
  S.scene = "loading";
  render();
  setTimeout(() => {
    S.scene = prior === "preview-error" || prior === "loading" ? "normal" : prior;
    render();
  }, 600);
};
const publicUrl = (p) => `https://folio.example.com/p/${p.version.replace("…", "")}/${p.id}`;
A["public-menu"] = (el) =>
  openPop(el, () => {
    const p = protoById(el.dataset.arg),
      ready = S.publicReady[p.id];
    if (ready === "busy") return `<div class="pop-pad"><div class="pop-title">公开链接</div><p class="pop-text" role="status">${icon("refresh", "spin")} 正在准备固定版本…</p></div>`;
    return ready
      ? `<div class="pop-pad share-pop"><div class="pop-title">公开链接</div><p class="pop-text">任何人都能匿名打开这个固定版本，不包含私有工程记录。之后更新原型不会改变这个链接的内容。</p><div class="copy-row"><input class="input sm mono-text" readonly value="${esc(publicUrl(p))}" aria-label="公开链接">${btn("复制", "copy-public", { kind: "sm primary", arg: p.id })}</div><div class="pop-actions">${btn("打开公开页", "open-public", { kind: "sm", arg: p.id, icon: "arrowUpRight" })}</div></div>`
      : `<div class="pop-pad"><div class="pop-title">公开链接</div><p class="pop-text">为当前固定版本生成一个匿名可访问的链接，方便发给团队外的人查看。</p><div class="pop-actions">${btn("准备公开链接", "prepare-public", { kind: "sm primary", arg: p.id, icon: "globe" })}</div></div>`;
  }, { align: "end", label: "公开链接", cls: "share" });
A["prepare-public"] = (el) => {
  const id = el.dataset.arg;
  S.publicReady[id] = "busy";
  refreshPop();
  setTimeout(() => {
    S.publicReady[id] = "now";
    if ($("#dlg").open) A["proto-details"]({ dataset: { arg: id } });
    refreshPop();
    toast("公开链接已准备");
  }, 700);
};
A["copy-public"] = (el) => {
  closePop();
  copyText(publicUrl(protoById(el.dataset.arg)), "公开链接");
};
A["open-public"] = (el) => go(`public/${el.dataset.arg}`);
function inlineCanvas(p) {
  const device = p.kind === "component" ? null : S.viewer.device && p.devices.includes(S.viewer.device) ? S.viewer.device : p.devices[0];
  const [w, h] = protoSize(p, device);
  return `<div class="inline-canvas">${p.kind === "component" ? "" : `<span class="seg sm" role="radiogroup" aria-label="设备">${p.devices.map((d) => `<button role="radio" aria-checked="${device === d}" data-action="inline-device" data-arg="${d}" data-key="id:${p.id}:${d}">${icon(DEVICE_ICON[d])}<span>${DEVICE_LABEL[d]}</span></button>`).join("")}</span>`}<div class="canvas inline" data-canvas><div class="device ${device || "component"}" data-w="${w}" data-h="${h}" style="width:${w}px;height:${h}px">${mock(p, w, h)}</div></div></div>`;
}
A["inline-device"] = (el) => {
  S.viewer.device = el.dataset.arg;
  render();
};
