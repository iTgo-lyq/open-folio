// Fictional review data only: no network, persistence, account or repository writes.
const $ = (s) => document.querySelector(s);
const tabs = ['overview','tasks','documents','previews','integration','evidence'];
const docs = { requirement:'需求', technical:'技术方案', plan:'实施计划', execution:'执行记录', review:'评审记录' };
let shared = true, version = 1, revision = 1, tab = 'documents', doc = 'technical', perspective = 'reader', scene = 'ready';
let noticeTimer, lastFocus;
const link = () => `https://folio.example/share/demo-${version}?ct=${tab}${tab === 'documents' ? `&document=${doc}.md` : ''}`;
function notify(message) { $('#notice').textContent=message; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('#notice').textContent='',3500); }
async function copy(value=link()) {
  try { await navigator.clipboard.writeText(value); notify('示例链接已复制'); }
  catch { $('#copy-value').value=value; $('#copy-dialog').showModal(); $('#copy-value').focus(); $('#copy-value').select(); }
}
function route(patch) {
  const q=new URLSearchParams(location.hash.slice(1));
  Object.entries(patch).forEach(([key,value])=>q.set(key,value));
  location.hash=q.toString(); readRoute();
}
function readRoute() {
  const q=new URLSearchParams(location.hash.slice(1));
  tab=tabs.includes(q.get('tab'))?q.get('tab'):'documents';
  doc=Object.hasOwn(docs,q.get('doc'))?q.get('doc'):'technical';
  perspective=q.get('who')==='owner'?'owner':'reader';
  scene=['new','revoked','unavailable','offline','loading'].includes(q.get('scene'))?q.get('scene'):'ready';
  $('#perspective').value=perspective; $('#scene').value=scene;
  render();
}
const body = () => ({
  requirement:`<h3>目标</h3><p>客服每天需要从大量订单中找到待处理项。保留常用筛选，减少重复选择，让回到列表后的上下文保持连续。</p><h3>范围</h3><ul><li>按订单状态筛选，支持一键清除。</li><li>保留筛选条件，手机与桌面使用同一套规则。</li><li>列表为空时说明原因，并提供清除筛选入口。</li></ul><h3>验收</h3><p>切换页面后返回，仍可看到原来的筛选结果；没有结果时可以恢复完整列表。</p>`,
  technical:`<p>在现有订单列表中保存筛选条件，使列表、结果数量和返回位置始终对应同一组选择。</p><div class="note">需求已明确：筛选条件保留到当前工作台；切换项目后重新开始。</div><h3>状态与数据流</h3><p>筛选状态由列表页面维护。筛选变化时更新地址参数，返回列表时读取参数并恢复相同结果。</p><div class="mini-flow" aria-label="选择筛选条件，然后更新地址，最后呈现匹配订单"><span>选择条件</span><b aria-hidden="true">→</b><span>更新地址</span><b aria-hidden="true">→</b><span>呈现结果</span></div><h3>交互与空态</h3><ul><li>选中条件在列表上方持续可见，支持单独移除。</li><li>没有匹配订单时说明当前条件，不显示误导性的空白列表。</li><li>手机端保留可触达的筛选和清除入口。</li></ul>${revision>1?'<div class="note" id="new-content">最新补充：返回列表时同时恢复阅读位置。</div>':''}<h3>验证方式</h3><p>覆盖首次进入、组合筛选、清除、页面返回和手机窄屏。查看 <a href="#tab=documents&doc=plan">实施计划</a>。</p><p class="muted">关联规范：<button class="inline-link" data-action="outside">订单列表规范 ↗</button></p>`,
  plan:`<h3>T1 · 保留筛选条件</h3><p>从地址恢复条件，并在用户切换筛选时同步更新。验证首次访问与浏览器前进、后退。</p><h3>T2 · 完善空态与窄屏阅读</h3><p>呈现筛选摘要与清除入口，保证手机可用。</p><h3>T3 · 验证与交付</h3><p>验证不同入口的一致性，记录浏览器检查结果后提交验收。</p>`,
  execution:`<h3>本次验证</h3><p>此页为示例材料。已检查筛选、返回位置和空态行为，详细验证结果随执行更新。</p>`,
  review:`<h3>评审结论</h3><p>此页为示例材料。关注条件恢复与空态说明的一致性；修订记录随 Change 更新。</p>`
})[doc];
function renderDocument() {
  return `<div class="reading-layout"><aside class="document-nav" aria-label="Change 文档"><p class="nav-caption">文档</p>${Object.entries(docs).map(([id,title])=>`<button data-doc="${id}" aria-current="${doc===id}">${title}<small>${id}.md</small></button>`).join('')}<div class="doc-source">来源<br>codex/order-filtering<br><code>${revision>1?'b52d091':'8c41a2e'}</code><br>随 Change 自动更新</div></aside><article class="document-article"><div class="doc-kicker"><span>${doc.toUpperCase()}.MD</span><span>最新已推送内容</span></div><h2>${docs[doc]}</h2>${body()}</article></div>`;
}
function renderPanel() {
  if(tab==='documents') return renderDocument();
  if(tab==='overview') return `<div class="content-pad"><h2>目标与进展</h2><div class="fact-row"><span>目标</span><p>更快找到需要处理的订单，并保留筛选上下文。</p></div><div class="fact-row"><span>当前阶段</span><p>技术方案 · 等待确认</p></div><div class="fact-row"><span>相关材料</span><button class="inline-link" data-doc="technical">阅读技术方案</button><button class="inline-link" data-doc="requirement">阅读需求</button></div><h2 style="margin-top:28px">澄清问答 <span class="muted">2</span></h2><div class="question"><strong>Q1 · 筛选条件保留多久？</strong><p>保留到当前工作台，切换项目后清除。</p></div><div class="question"><strong>Q2 · 手机端是否同步支持？</strong><p>支持，与桌面采用同一套筛选规则。</p></div></div>`;
  if(tab==='tasks') return `<div class="content-pad"><h2>实施任务</h2>${['保留筛选条件','完善空态与窄屏阅读','验证与交付'].map((title,i)=>`<div class="fact-row"><span class="task-number">T${i+1}</span><p>${title}</p><span class="task-status">未开始</span></div>`).join('')}<p class="dialog-footnote">任务随 Change 更新，此页面仅供阅读。</p></div>`;
  if(tab==='previews') return `<div class="content-pad"><h2>订单列表 · 页面原型</h2><div class="preview-tools" aria-label="预览设备"><button data-device="desktop" aria-pressed="true">桌面</button><button data-device="mobile" aria-pressed="false">手机</button><span class="muted">示例版本 · 已发布</span></div><div class="demo-canvas"><div class="order-demo"><h3>订单</h3><div aria-label="订单筛选"><button data-filter="all" aria-pressed="true">全部 3</button><button data-filter="pending" aria-pressed="false">待处理 1</button></div><div id="orders"><p><span>#AT-1028</span><span>待处理</span></p><p data-completed><span>#AT-1027</span><span>已完成</span></p><p data-completed><span>#AT-1026</span><span>已完成</span></p></div></div></div><p class="dialog-footnote">此处是可交互的示例；真实页面显示该 Change 已发布的原型。</p></div>`;
  if(tab==='integration') return `<div class="content-pad"><h2>合入变更</h2><div class="integration-summary"><span>示例：已合入 develop</span><code>9b72c41</code><span>2 个文件 · +6 −2</span></div><div class="diff-grid" data-view="list"><aside class="diff-files" aria-label="变更文件"><button data-file="code" aria-current="true">src/orders/filter.ts</button><button data-file="style" aria-current="false">src/orders/filter.css</button></aside><div class="diff-code"><button class="mobile-back" data-action="back-files">‹ 返回文件列表</button><pre tabindex="0" aria-label="代码合入差异" id="diff-text">@@ -12,3 +12,5 @@\n  export function readFilters(search) {\n-   return defaultFilters;\n+   const params = new URLSearchParams(search);\n+   return parseFilters(params);\n  }</pre></div></div></div>`;
  return `<div class="content-pad"><h2>确认与来源</h2><div class="fact-row"><span>需求确认</span><p>支持保留筛选条件、明确空态，并覆盖手机阅读。<br><span class="muted">2026-10-20 10:30 · 示例记录</span></p></div><div class="fact-row"><span>技术确认</span><p>等待确认</p></div><div class="fact-row"><span>最新来源</span><p>codex/order-filtering<br><code>${revision>1?'b52d091':'8c41a2e'}</code></p></div><div class="fact-row"><span>关联 Change</span><button class="inline-link" data-action="outside">订单工作台优化 ↗</button></div></div>`;
}
function render() {
  const blocked = perspective==='reader' && ['new','revoked','unavailable','loading'].includes(scene);
  $('#content').hidden=blocked; $('#unavailable').hidden=!blocked;
  $('#manage').hidden=perspective!=='owner'; $('#copy').hidden=blocked||perspective==='owner';
  $('#view-label').textContent=perspective==='owner'?'Change 详情':'Change 分享';
  $('.read-label').textContent=perspective==='owner'?'只读':'只读分享';
  $('#sync-warning').hidden=scene!=='offline';
  $('#sync-label').textContent=scene==='offline'?'未能同步 · 上次读取 10:42':`自动更新 · ${revision>1?'内容已更新':'刚刚同步'}`;
  if(blocked) {
    const states={new:['链接尚未启用','请联系分享者创建分享链接。'],revoked:['分享已停止','分享者已关闭此链接。请联系分享者获取新的链接。'],unavailable:['暂时无法读取内容','分享来源目前不可用，请稍后重试或联系分享者。'],loading:['正在读取 Change','正在获取最新内容，请稍候。']};
    const [title,description]=states[scene];
    $('#unavailable').innerHTML=`<div class="state-icon" aria-hidden="true">${scene==='loading'?'⋯':'↗'}</div><h1>${title}</h1><p>${description}</p>${scene==='unavailable'?'<button class="outline-button" data-action="retry">重新读取</button>':''}`;
    return;
  }
  document.querySelectorAll('[data-tab]').forEach(b=>{ const active=b.dataset.tab===tab; b.setAttribute('aria-selected',String(active)); b.tabIndex=active?0:-1; });
  $('#detail-panel').setAttribute('aria-labelledby',`tab-${tab}`); $('#detail-panel').innerHTML=renderPanel();
}
function renderShare() {
  if(scene==='new'||!shared||scene==='revoked') $('#share-controls').innerHTML=`<p class="dialog-footnote">${scene==='revoked'||!shared?'原链接已停止访问，重新分享会生成新链接。':'创建后，获得链接的人即可阅读当前 Change。'}</p><div class="dialog-actions"><span></span><button class="primary-button" data-action="create">创建分享链接</button></div>`;
  else $('#share-controls').innerHTML=`<span class="share-on">● 分享已开启</span><div class="share-link"><input readonly aria-label="当前分享链接" value="${link()}"><button class="outline-button" data-action="copy">复制</button></div><div class="dialog-actions"><button class="stop-button" data-action="stop">停止分享</button><button class="outline-button" data-action="visit">查看分享页 ↗</button></div><p class="dialog-footnote">停止后，此链接无法再查看内容。</p>`;
}
function openShare() { lastFocus=document.activeElement; renderShare(); $('#share-dialog').showModal(); }
$('#share-dialog').addEventListener('close',()=>lastFocus?.focus());
$('#manage').onclick=openShare; $('#close-share').onclick=()=>$('#share-dialog').close();
$('#copy').onclick=()=>copy(); $('#close-copy').onclick=()=>$('#copy-dialog').close();
$('#perspective').onchange=e=>route({who:e.target.value});
$('#scene').onchange=e=>{ if(e.target.value==='new')shared=false; if(e.target.value==='ready')shared=true; route({scene:e.target.value}); };
$('#simulate-update').onclick=()=>{revision++;route({scene:'ready',tab:'documents',doc:'technical'});notify('已同步新的技术方案；分享链接保持不变');};
$('#refresh').onclick=$('#retry-sync').onclick=()=>{if(scene==='offline'||scene==='loading'||scene==='unavailable')route({scene:'ready'});notify('已检查最新内容');};
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.tab)route({tab:b.dataset.tab});
  if(b.dataset.doc)route({tab:'documents',doc:b.dataset.doc});
  if(b.dataset.device){$('.order-demo').classList.toggle('mobile',b.dataset.device==='mobile');document.querySelectorAll('[data-device]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));}
  if(b.dataset.filter){document.querySelectorAll('[data-completed]').forEach(el=>el.hidden=b.dataset.filter==='pending');document.querySelectorAll('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));}
  if(b.dataset.file){$('.diff-grid').dataset.view='diff';document.querySelectorAll('[data-file]').forEach(el=>el.setAttribute('aria-current',String(el===b)));$('#diff-text').textContent=b.dataset.file==='style'?'@@ -0,0 +1,4 @@\n+ .filter-bar {\n+   display: flex;\n+   flex-wrap: wrap;\n+ }':'@@ -12,3 +12,5 @@\n  export function readFilters(search) {\n-   return defaultFilters;\n+   const params = new URLSearchParams(search);\n+   return parseFilters(params);\n  }';}
  switch(b.dataset.action){
    case 'outside':notify('此内容不在当前分享范围内');break;
    case 'back-files':$('.diff-grid').dataset.view='list';break;
    case 'retry':route({scene:'ready'});break;
    case 'copy':copy();break;
    case 'visit':$('#share-dialog').close();route({who:'reader',scene:'ready'});break;
    case 'create':shared=true;version++;scene='ready';route({scene:'ready'});renderShare();notify('示例分享链接已创建');break;
    case 'stop':shared=false;scene='revoked';route({scene:'revoked'});renderShare();notify('分享已停止，原链接无法再查看内容');break;
  }
});
$('.detail-tabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault(); const i=tabs.indexOf(tab),n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  route({tab:tabs[n]}); $(`#tab-${tabs[n]}`).focus();
});
addEventListener('hashchange',readRoute);readRoute();
