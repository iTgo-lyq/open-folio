// Review-only fixtures. No API, storage or real repository access.
const merge = '9b72c41a82615d3b8c90e2f4a671d80cbe5a920f';
const files = [
  { id: 'reader', path: 'src/components/document-reader.tsx', status: '修改', added: 4, removed: 2, lines: [
    ['hunk', '', '', '@@ -18,5 +18,7 @@'], ['context', 18, 18, 'export function DocumentReader({ document }) {'],
    ['remove', 19, '', '  const showOutline = true;'], ['remove', 20, '', '  const position = 0;'],
    ['add', '', 19, '  const [outlineOpen, setOutlineOpen] = useState(false);'],
    ['add', '', 20, '  const position = useReadingPosition(document.id);'],
    ['add', '', 21, '  const closeOutline = () => setOutlineOpen(false);'],
    ['add', '', 22, '  useRestoreScroll(position);'], ['context', 21, 23, '  return ('],
    ['context', 22, 24, '    <article className="document-reader">'],
  ] },
  { id: 'styles', path: 'src/components/document-reader.css', status: '新增', added: 4, removed: 0, lines: [
    ['hunk', '', '', '@@ -0,0 +1,4 @@'], ['add', '', 1, '.document-reader {'], ['add', '', 2, '  min-width: 0;'],
    ['add', '', 3, '  overflow-wrap: anywhere;'], ['add', '', 4, '}'],
  ] },
  { id: 'archive', path: 'docs/project/archive/2026-10-18-reading-experience/requirement.md', oldPath: 'docs/project/changes/reading-experience/requirement.md', status: '重命名', added: 0, removed: 0, message: '文件已移动，内容未变', description: '需求文档随 Change 归档，移动记录包含在本次合入差异中。' },
  { id: 'removed', path: 'src/lib/legacy-reading-position.ts', status: '删除', added: 0, removed: 3, lines: [
    ['hunk', '', '', '@@ -1,3 +0,0 @@'], ['remove', 1, '', 'export function readingPosition() {'], ['remove', 2, '', '  return 0;'], ['remove', 3, '', '}'],
  ] },
  { id: 'binary', path: 'docs/project/archive/2026-10-18-reading-experience/assets/mobile.png', status: '新增 · 二进制', added: null, removed: null, message: '二进制文件，无法展示文本差异', description: '文件已包含在变更清单中，增删行数不适用。' },
  { id: 'large', path: 'docs/project/archive/2026-10-18-reading-experience/previews/reader/index.html', status: '新增', added: 12041, removed: 0, message: '内容过大，未完整展示', description: '此文件的差异超过展示上限。可以复制固定 Git 比较命令，在本地查看完整内容。' },
];
const $ = (query) => document.querySelector(query);
const drawer = $('.change-drawer');
const scenario = $('#scenario');
const tabs = [...document.querySelectorAll('.drawer-tabs button[data-tab]')];
let currentFile = files[0];
let noticeTimer;
function node(tag, text, className) {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
  if (className) el.className = className; return el;
}
function notify(text) {
  $('#notice').textContent = text; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('#notice').textContent = ''; }, 2500);
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); notify('已复制'); }
  catch { $('#copy-value').value = value; $('#copy-dialog').showModal(); $('#copy-value').focus(); $('#copy-value').select(); }
}
function setRoute(patch) {
  const route = new URLSearchParams(location.hash.slice(1));
  for (const [key, value] of Object.entries(patch)) value === null ? route.delete(key) : route.set(key, value);
  const hash = route.toString();
  if (location.hash.slice(1) === hash) render(); else location.hash = hash;
}
function showState(target, title, description, retry = false) {
  const box = node('div', undefined, 'result-state'); box.append(node('h3', title), node('p', description));
  if (retry) { const button = node('button', '重新读取'); button.onclick = () => setRoute({ scene: 'found' }); box.append(button); }
  target.replaceChildren(box);
}
function renderFile(id) {
  currentFile = files.find(file => file.id === id) || files[0];
  const file = currentFile;
  $('#selected-path').textContent = file.path;
  $('#selected-meta').textContent = file.oldPath ? `原路径：${file.oldPath}` : file.status;
  $('#file-list').replaceChildren(...files.map(item => {
    const button = node('button', undefined, 'file-item'); button.dataset.file = item.id;
    button.setAttribute('aria-current', String(item.id === file.id));
    const parts = item.path.split('/');
    button.append(node('span', parts.pop(), 'file-name'), node('span', parts.join('/') + '/', 'file-directory'));
    const status = node('span', undefined, 'file-status'); status.append(node('span', item.status));
    if (item.added !== null) status.append(node('span', `+${item.added}`, 'added'), node('span', `−${item.removed}`, 'removed'));
    button.append(status); button.onclick = () => { setRoute({ file: item.id, view: 'diff' }); requestAnimationFrame(() => $('#file-diff').focus()); };
    return button;
  }));
  if (!file.lines) { showState($('#file-diff'), file.message, file.description); return; }
  const table = node('table', undefined, 'diff-table'); table.setAttribute('aria-label', `${file.path} 的统一差异`);
  const body = node('tbody');
  for (const [kind, oldLine, newLine, text] of file.lines) {
    const row = node('tr', undefined, kind);
    if (kind === 'hunk') { const cell = node('td', text); cell.colSpan = 4; row.append(cell); }
    else row.append(node('td', oldLine, 'line-no'), node('td', newLine, 'line-no'), node('td', kind === 'add' ? '+' : kind === 'remove' ? '−' : ' ', 'sign'), node('td', text));
    body.append(row);
  }
  table.append(body); $('#file-diff').replaceChildren(table); $('#file-diff').scrollTop = 0; $('#file-diff').scrollLeft = 0;
}
function render() {
  const route = new URLSearchParams(location.hash.slice(1));
  const tab = route.get('tab') === 'overview' ? 'overview' : 'integration';
  const scene = [...scenario.options].some(option => option.value === route.get('scene')) ? route.get('scene') : 'found';
  scenario.value = scene; drawer.dataset.tab = tab;
  for (const button of tabs) { const active = button.dataset.tab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
  $('#overview').hidden = tab !== 'overview'; $('#integration').hidden = tab !== 'integration';
  const found = scene === 'found';
  $('#found-record').hidden = !found; $('#integration-result').replaceChildren();
  if (scene === 'missing') showState($('#integration-result'), '暂无合入记录', '当前历史中没有可识别的合入记录。归档文档仍可从其他页签阅读。');
  if (scene === 'invalid') showState($('#integration-result'), '合入记录存在异常', '发现两个关联同一 Change 的提交：9b72c41、4d2187a。记录未能唯一定位，暂不展示差异。');
  if (scene === 'unavailable') showState($('#integration-result'), '暂时无法读取合入记录', '仓库历史读取失败，请稍后重试。', true);
  if (scene === 'loading') {
    showState($('#integration-result'), '正在读取合入记录…', '正在查找本次交付的固定版本。');
    for (let i = 0; i < 2; i++) $('#integration-result .result-state').append(node('div', undefined, 'loading-line'));
  }
  $('#diff-total').textContent = '6 个文件 · 文本 +12049 / −5';
  $('#file-count').textContent = '6';
  if (found) {
    renderFile(route.get('file')); $('.diff-layout').dataset.view = route.get('view') === 'diff' ? 'diff' : 'list';
  }
}
for (const button of tabs) {
  button.onclick = () => setRoute({ tab: button.dataset.tab });
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const index = tabs.indexOf(button);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus(); setRoute({ tab: next.dataset.tab });
  };
}
scenario.onchange = () => { drawer.hidden = false; setRoute({ scene: scenario.value, tab: 'integration', file: null, view: null }); };
$('#back-files').onclick = () => { setRoute({ view: 'list' }); requestAnimationFrame(() => $(`.file-item[data-file="${currentFile.id}"]`).focus()); };
$('#copy-sha').onclick = () => copy(merge);
$('#copy-command').onclick = () => copy(`git diff --no-ext-diff --no-textconv ${merge}^1 ${merge}`);
$('#close-copy').onclick = () => $('#copy-dialog').close();
function closeDrawer() { drawer.hidden = true; $('#reopen').focus(); }
$('#close').onclick = closeDrawer;
$('#reopen').onclick = () => { drawer.hidden = false; $('#close').focus(); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#copy-dialog').open && !drawer.hidden) closeDrawer(); });
window.addEventListener('hashchange', render);
render();
