// 动态视图原型：只在内存中维护，正式的账号同步及并发协议见 Change 技术方案。
const viewStores = {};
let managerDraft = null, viewEditor = null, managerError = "", failViewSaveOnce = false, viewSequence = 1;
ICONS.pencil = '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>';
ICONS.grip = '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>';
ICONS.eyeOff = '<path d="m3 3 18 18M10.5 10.5a2 2 0 0 0 3 3M9 5c5-1 9 2 12 7a16 16 0 0 1-3 4M6 6a17 17 0 0 0-4 6c4 7 10 9 16 5"/>';
function defaultViewConfig() { return { states: ["active"], types: [], urgency: [], creators: [], view: "list", group: "status", sort: "created" }; }
function directoryStatus(c) { return c.status === "completed" && c.delivery?.stage === "releaseMerged" ? "archived" : c.status; }
function viewRecords() { return changesOf().filter(c => S.scene !== "empty" && (S.scene !== "views-no-cancelled" || c.status !== "cancelled")); }
function matchesViewStates(c, states = []) { return c.status !== "unknown" && (!states.length || states.includes(directoryStatus(c))); }
function currentViewConfig() { return Object.fromEntries(Object.keys(defaultViewConfig()).map(k => [k, clone(S.changes[k])])); }
function viewStore() { return viewStores[S.repo]; }
function syncViewScope() { S.changes.scope = S.changes.states.length === 1 ? S.changes.states[0] : "mixed"; }
function loadViewConfig(config) { Object.assign(S.changes, clone(config), { issues: false }); syncViewScope(); }
function ensureChangeViews() {
  if (!viewStores[S.repo]) viewStores[S.repo] = { selected: "mine", views: [{ id: "mine", name: "我的", visible: true, config: { ...defaultViewConfig(), creators: ["@me"] } }] };
  if (S.viewsRepo !== S.repo) {
    S.viewsRepo = S.repo;
    const v = viewStore().views.find(v => v.id === viewStore().selected);
    loadViewConfig(v?.config || { ...defaultViewConfig(), states: [viewStore().selected.split(":")[1] || "active"] });
  }
  if (S.scene === "views-saved" && !viewStore().examplesAdded) {
    viewStore().examplesAdded = true;
    viewStore().views.push({ id: "high", name: "高优先级", visible: true, config: { ...defaultViewConfig(), urgency: ["urgent", "high"] } }, { id: "shipped", name: "已发布功能", visible: true, config: { ...defaultViewConfig(), states: ["archived"], types: ["新功能"] } });
  }
  if (S.scene === "views-no-cancelled" && viewStore().selected === "system:cancelled") {
    viewStore().selected = "system:active";
    loadViewConfig(defaultViewConfig());
  }
}
function selectChangeView(id) {
  closePop(false);
  viewStore().selected = id;
  const v = viewStore().views.find(v => v.id === id);
  loadViewConfig(v ? v.config : { ...defaultViewConfig(), states: [id.split(":")[1]] });
  render();
}
A["select-change-view"] = el => selectChangeView(el.dataset.arg);
function configEqual(a, b) {
  const normalized = c => Object.fromEntries(Object.entries(c).map(([k,v]) => [k, Array.isArray(v) ? [...v].sort() : v]));
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
function selectedSavedView() { return viewStore().views.find(v => v.id === viewStore().selected); }
function viewIsDirty() { const v = selectedSavedView(); return v && !configEqual(v.config, currentViewConfig()); }
function viewTabs(all) {
  const selected = viewStore().selected;
  const tab = (id, name, n) => `<button role="tab" aria-selected="${selected === id && !S.changes.issues}" tabindex="${selected === id ? 0 : -1}" data-key="view-tab:${esc(id)}" data-action="select-change-view" data-arg="${esc(id)}"><span>${esc(name)}</span><span class="count">${n}</span>${id === selected && viewIsDirty() ? '<i class="view-dirty-dot" aria-label="有未保存修改"></i>' : ''}</button>`;
  const countView = v => {
    const c = v.config;
    return all.filter(row => matchesViewStates(row,c.states) && (!c.creators.length || c.creators.includes(row.creator) || (c.creators.includes("@me") && row.creator === ACCOUNT.person)) && (!c.types.length || row.labels.some(t => c.types.includes(t)) || (!row.labels.length && c.types.includes("__none"))) && (!c.urgency.length || c.urgency.includes(row.urgency || "normal"))).length;
  };
  return `<div class="view-tab-bar"><div class="seg view-tabs" role="tablist" aria-label="Change 视图">${viewStore().views.filter(v => v.visible).map(v => tab(v.id,v.name,countView(v))).join("")}${SCOPES.filter(([k]) => k !== "cancelled" || all.some(c => inScope(c,k))).map(([k,l]) => tab("system:"+k,l,all.filter(c => inScope(c,k)).length)).join("")}</div>${ibtn("管理视图", "manage-views", "settings", { key: "manage-views", popup: "dialog", cls: "view-settings" })}</div>`;
}
function conditionChips() {
  const f = S.changes;
  const selections = [...f.states.map(v => ["states",v,SCOPES.find(([k]) => k === v)?.[1]]), ...f.creators.map(v => ["creators",v,`创建者：${v === "@me" ? "我" : person(v).name}`]), ...f.types.map(v => ["types",v,`类型：${v === "__none" ? "无类型" : v}`]), ...f.urgency.map(v => ["urgency",v,`紧急程度：${URGENCY[v]}`])];
  return selections.map(([k,v,l]) => `<button class="chip" data-action="drop-filter" data-arg="${esc(k+":"+v)}" data-key="chip:${esc(k+":"+v)}" aria-label="移除筛选 ${esc(l)}">${esc(l)}${icon("x")}</button>`).join("") || '<span class="muted">全部状态 · 不限创建者</span>';
}
function viewDirtyBar() {
  if (!viewIsDirty()) return "";
  return `<div class="view-dirty-bar"><span>当前视图有未保存修改</span>${btn("恢复", "restore-change-view", {kind:"ghost sm"})}<span class="grow"></span>${btn("另存为新视图", "new-view-from-page", {kind:"ghost sm"})}${btn("保存到当前视图", "save-current-view", {kind:"sm"})}</div>`;
}
A["restore-change-view"] = () => { loadViewConfig(selectedSavedView().config); render(); };
function simulatedViewSaveFailure() {
  if (S.scene === "views-save-error" && !failViewSaveOnce) { failViewSaveOnce = true; return true; }
  return false;
}
A["save-current-view"] = () => {
  if (simulatedViewSaveFailure()) return toast("保存失败，当前筛选已保留，请重试", "error");
  selectedSavedView().config = currentViewConfig(); render(); toast("已保存当前视图");
};
function summaryConfig(c) {
  return [c.states.length ? c.states.map(s => SCOPES.find(([k]) => k === s)?.[1]).join("、") : "全部状态", c.creators.length ? c.creators.map(p => p === "@me" ? "我" : person(p).name).join("、") : "所有创建者", c.view === "board" ? "看板" : "列表"].join(" · ");
}
function openViewManager(anchor, keepDraft = false) {
  if (!keepDraft) { managerDraft = clone(viewStore().views); viewEditor = null; managerError = ""; S.newManagedView = null; }
  openPop(anchor, renderViewManager, { label:"管理视图", align:"end", cls:"views-manager" });
}
A["manage-views"] = el => openViewManager(el);
function renderViewManager() {
  if (viewEditor) return renderViewEditor();
  return `<div class="views-manager-heading"><strong>管理视图</strong><span class="muted">仅自己可见</span></div><ul class="managed-views" aria-label="个人视图排序">${managerDraft.map((v,i) => `<li class="managed-view ${v.visible ? '' : 'is-hidden'}" data-view-row="${esc(v.id)}"><button class="ibtn view-grip" draggable="true" data-view-drag="${esc(v.id)}" data-key="grip:${esc(v.id)}" aria-label="拖拽排序 ${esc(v.name)}" title="拖动排序，或用 Alt + 上下方向键移动">${icon("grip")}</button><div class="managed-view-label"><strong>${esc(v.name)}</strong><small>${esc(summaryConfig(v.config))}${v.visible ? '' : ' · 已隐藏'}</small></div><div class="view-row-actions">${ibtn(v.visible ? `隐藏 ${v.name}` : `显示 ${v.name}`, "view-visibility", v.visible ? "eye" : "eyeOff", {arg:v.id, tip:false})}${ibtn(`编辑 ${v.name}`,"edit-managed-view","pencil",{arg:v.id,tip:false})}${ibtn(`删除 ${v.name}`,"delete-managed-view","trash",{arg:v.id,tip:false})}</div><div class="view-order-actions">${ibtn(`上移 ${v.name}`,"move-managed-view","up",{arg:`${i}:-1`,disabled:i===0,tip:false})}${ibtn(`下移 ${v.name}`,"move-managed-view","down",{arg:`${i}:1`,disabled:i===managerDraft.length-1,tip:false})}</div></li>`).join("") || '<li class="view-manager-empty">还没有个人视图，添加一个常用组合。</li>'}</ul>${managerError ? `<p class="view-save-error" role="alert">${esc(managerError)}</p>` : ''}<div class="view-manager-footer">${btn("添加视图","add-managed-view",{icon:"plus",kind:"ghost",key:"add-managed-view"})}<span class="grow"></span>${btn("取消","cancel-view-manager")}${btn(managerError ? "重试保存" : "确认","confirm-view-manager",{kind:"primary"})}</div>`;
}
A["view-visibility"] = el => { const v = managerDraft.find(v => v.id === el.dataset.arg); v.visible = !v.visible; refreshPop(); };
A["delete-managed-view"] = el => { managerDraft = managerDraft.filter(v => v.id !== el.dataset.arg); refreshPop(); };
function moveManagedView(from,to) {
  if (to < 0 || to >= managerDraft.length || from === to) return;
  const [v] = managerDraft.splice(from,1); managerDraft.splice(to,0,v); refreshPop();
  toast(`已将“${v.name}”移到第 ${to+1} 位，确认后保存`);
}
A["move-managed-view"] = el => { const [i,d] = el.dataset.arg.split(":").map(Number); moveManagedView(i,i+d); };
let draggedViewId;
document.addEventListener("dragstart",e => { const h=e.target.closest("[data-view-drag]"); if(h) { draggedViewId=h.dataset.viewDrag; e.dataTransfer.setData("text/plain",draggedViewId); e.dataTransfer.effectAllowed="move"; } });
document.addEventListener("dragover",e => { if(draggedViewId && e.target.closest("[data-view-row]")) e.preventDefault(); });
document.addEventListener("drop",e => { const row=e.target.closest("[data-view-row]"); if(row && draggedViewId) { e.preventDefault(); moveManagedView(managerDraft.findIndex(v => v.id===draggedViewId),managerDraft.findIndex(v => v.id===row.dataset.viewRow)); draggedViewId=null; } });
document.addEventListener("dragend",() => { draggedViewId=null; });
document.addEventListener("keydown",e => { const h=e.target.closest("[data-view-drag]"); if(h && e.altKey && ["ArrowUp","ArrowDown"].includes(e.key)) { e.preventDefault(); const i=managerDraft.findIndex(v => v.id===h.dataset.viewDrag); moveManagedView(i,i+(e.key==="ArrowUp"?-1:1)); } });
A["cancel-view-manager"] = () => { closePop(); managerDraft=null; viewEditor=null; };
A["confirm-view-manager"] = () => {
  if (simulatedViewSaveFailure()) { managerError="保存失败，修改仍在这里。请重试，或取消本次修改。"; refreshPop(); return; }
  const store=viewStore(), previous=selectedSavedView(), previousConfig=previous?.config;
  store.views=clone(managerDraft);
  const next=store.views.find(v => v.id===store.selected && v.visible);
  const target=viewEditor?.id || S.newManagedView;
  if (target && store.views.some(v => v.id===target && v.visible)) { store.selected=target; loadViewConfig(store.views.find(v => v.id===target).config); }
  else if (!store.selected.startsWith("system:") && !next) { store.selected=store.views.find(v=>v.id==="mine" && v.visible)?.id || "system:active"; loadViewConfig(store.views.find(v=>v.id===store.selected)?.config || defaultViewConfig()); }
  else if (next && previousConfig && !configEqual(next.config, previousConfig)) loadViewConfig(next.config);
  S.newManagedView=null;
  closePop(false); render(); $('[data-key="manage-views"]')?.focus(); toast("视图已保存");
};
A["add-managed-view"] = () => { viewEditor={id:`view-${viewSequence++}`,name:"",visible:true,config:currentViewConfig(),isNew:true}; refreshPop(); $('#view-name')?.focus(); };
A["edit-managed-view"] = el => { viewEditor=clone(managerDraft.find(v=>v.id===el.dataset.arg)); refreshPop(); $('#view-name')?.focus(); };
A["new-view-from-page"] = () => { openViewManager($('[data-key="manage-views"]')); A["add-managed-view"](); };
function viewEditorOptions(field,options) {
  const c=viewEditor.config;
  return options.map(([key,label]) => `<label class="view-check"><input type="checkbox" data-view-field="${field}" value="${esc(key)}" ${c[field].includes(key)?'checked':''}><span>${esc(label)}</span></label>`).join("");
}
function renderViewEditor() {
  const e=viewEditor, c=e.config;
  const select=(key,options) => `<select class="input" data-view-select="${key}" aria-label="${{view:"展示方式",group:"分组方式",sort:"排序方式"}[key]}">${options.map(([k,l])=>`<option value="${k}" ${c[key]===k?'selected':''}>${l}</option>`).join("")}</select>`;
  const types=[...new Set(changesOf().flatMap(c=>c.labels))];
  return `<div class="views-manager-heading"><strong>${e.isNew?'添加视图':'编辑视图'}</strong>${ibtn("返回视图管理","cancel-view-editor","x",{tip:false})}</div><div class="view-editor-body"><label class="field"><span>视图名称</span><input class="input" id="view-name" maxlength="40" value="${esc(e.name)}" placeholder="例如：我的进行中" autocomplete="off"></label>${e.isNew?'<p class="field-note">已带入当前筛选和显示选项，可在下面调整。</p>':''}<fieldset><legend>状态 <span>可多选 · 不选时包含全部状态</span></legend><div class="view-checks states">${viewEditorOptions("states",SCOPES)}</div></fieldset><fieldset><legend>创建者</legend><div class="view-checks">${viewEditorOptions("creators",[["@me","我（当前 GitHub 身份）"],...Object.entries(PEOPLE).map(([k,p])=>[k,p.name])])}</div></fieldset><fieldset><legend>类型</legend><div class="view-checks">${viewEditorOptions("types",[...types.map(t=>[t,t]),["__none","无类型"]])}</div></fieldset><fieldset><legend>紧急程度</legend><div class="view-checks">${viewEditorOptions("urgency",Object.entries(URGENCY))}</div></fieldset><div class="view-display-fields"><label class="field"><span>展示方式</span>${select("view",[["list","列表"],["board","看板"]])}</label><label class="field"><span>分组</span>${select("group",[["status","按处理状态"],["stage","按阶段"],["none","不分组"]])}</label><label class="field"><span>排序</span>${select("sort",[["created","最新创建"],["urgency","紧急程度优先"]])}</label></div><p class="field-note">看板仅用于单独选择“进行中”；其他状态组合以列表展示。</p><p class="view-editor-error field-error" role="alert"></p></div><div class="view-manager-footer"><span class="muted grow">完成后，在管理面板确认保存</span>${btn("取消","cancel-view-editor")}${btn("完成","apply-view-editor",{kind:"primary"})}</div>`;
}
document.addEventListener("input",e => { if(viewEditor && e.target.id==="view-name") viewEditor.name=e.target.value; });
document.addEventListener("change",e => {
  if(!viewEditor) return;
  const el=e.target,k=el.dataset.viewField;
  if(k) { const a=viewEditor.config[k]; viewEditor.config[k]=el.checked?[...a,el.value]:a.filter(v=>v!==el.value); }
  if(el.dataset.viewSelect) viewEditor.config[el.dataset.viewSelect]=el.value;
});
A["cancel-view-editor"] = () => { viewEditor=null; refreshPop(); $('[data-key="add-managed-view"]')?.focus(); };
A["apply-view-editor"] = () => {
  const name=viewEditor.name.trim();
  if(!name || managerDraft.some(v=>v.id!==viewEditor.id && v.name===name)) { $('.view-editor-error').textContent=!name?"请输入视图名称。":"已有同名视图，请换一个名称。"; $('#view-name').setAttribute("aria-invalid","true"); $('#view-name').focus(); return; }
  viewEditor.name=name;
  const index=managerDraft.findIndex(v=>v.id===viewEditor.id), value=clone(viewEditor);
  delete value.isNew;
  if(index<0) { managerDraft.push(value); S.newManagedView=value.id; } else managerDraft[index]=value;
  viewEditor=null; refreshPop(); $('[data-action="confirm-view-manager"]')?.focus();
};
