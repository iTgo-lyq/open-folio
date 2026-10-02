import type { ChangeCandidate, ChangeGroup, ChangeState, Diagnostic, Relation } from '../lib/model.ts';
import { primaryRecord } from '../lib/model.ts';
import type { Collected } from './indexer.ts';
import type { GitReader } from './git.ts';
import { branchName, changeSchema, identity, validDate } from './schema.ts';
import { cyclicNodes, parsePlan } from './plan.ts';
import { inspectMarkdown, resolveDocumentLink } from '../lib/markdown.ts';
const issue = (code: string, message: string, path?: string): Diagnostic => ({ code, message, path, severity: 'error' });
function semantics(c: ChangeCandidate, data: Collected) {
  const s = c.state!;
  const add = (code: string, message: string, field = '') => c.diagnostics.push(issue(code, message, `${c.directory}/change.json${field}`));
  const directoryId = c.directory.split('/').at(-1)!;
  if (c.archived ? directoryId.slice(11) !== s.id || !validDate(directoryId.slice(0, 10)) : directoryId !== s.id) add('DIRECTORY_ID', '目录与声明 id 不匹配，或归档日期无效。');
  if (s.size === 'small' && ['technical', 'plan'].includes(s.stage)) add('STAGE_ROUTE', 'small 的路线不包含技术或计划阶段。', '/stage');
  if (['medium', 'xlarge'].includes(s.size) && s.stage === 'plan') add('STAGE_ROUTE', '该规模将技术与计划合并，不单独进入 plan。', '/stage');
  if (s.size === 'xlarge' && (Object.keys(s.tasks).length || s.dependsOn?.length || s.parent)) add('XLARGE_SHAPE', 'xlarge 使用子 Change，不应有实现任务、前置 Change 或父 Change。');
  if (s.size !== 'xlarge' && s.children?.length) add('CHILDREN_SHAPE', '只有 xlarge 可以声明子 Change。', '/children');
  if (s.status !== 'cancelled') {
    const needed = s.stage === 'requirement' || s.size === 'small' ? [] : s.stage === 'technical' ? ['requirement'] : s.stage === 'plan' ? ['requirement', 'technical'] : ['requirement', 'technical', 'plan'];
    for (const key of needed) if (!s.confirmations[key as keyof ChangeState['confirmations']]) add('CONFIRMATION_MISSING', `当前阶段缺少 ${key} 确认记录。`, `/confirmations/${key}`);
    if (s.stage === 'close' && Object.values(s.tasks).some(t => t.status !== 'done')) add('TASKS_UNFINISHED', '关闭阶段仍有未完成任务。', '/tasks');
  }
  if (s.status === 'completed' && ['medium', 'large'].includes(s.size) && c.taskGraph.status !== 'valid') add('PLAN_INVALID', '完成记录缺少可判定的 Plan 执行顺序。');
  const steps = ['verification', 'acceptance', 'specs', 'archive'] as const;
  for (let i = 0; i < steps.length; i++) {
    const v = s.closure[steps[i]]; if (!v) continue;
    if (s.stage !== 'close') add('CLOSURE_STAGE', '存在关闭记录，但当前阶段不是 close。', `/closure/${steps[i]}`);
    if (i && (!s.closure[steps[i - 1]] || s.closure.verification?.result !== 'passed')) add('CLOSURE_ORDER', '关闭记录缺少此前成功步骤。', `/closure/${steps[i]}`);
    if (i && s.closure[steps[i - 1]] && Date.parse(v.at) < Date.parse(s.closure[steps[i - 1]]!.at)) add('CLOSURE_TIME', '关闭步骤的时间顺序矛盾。', `/closure/${steps[i]}`);
  }
  if (s.status === 'completed') {
    if (s.stage !== 'close' || s.closure.verification?.result !== 'passed' || steps.some(k => !s.closure[k]) || s.waitingFor) add('COMPLETION_INVALID', '完成声明缺少有效关闭四步，或仍在等待。');
    if (!c.archived || s.closure.archive?.path !== c.directory) add('ARCHIVE_PATH', '完成声明未对应当前归档目录。', '/closure/archive/path');
    if (data.documents.some(d => d.branch === c.branch && d.path.startsWith(`docs/project/changes/${s.id}/`))) add('LIVE_DIRECTORY_REMAINS', '该分支仍保留原 Change 目录，不满足归档条件。');
  } else if (c.archived) add('ARCHIVE_STATUS', '归档目录内的记录未声明完成。', '/status');
  c.validCompleted = s.status === 'completed' && !c.diagnostics.some(d => d.severity === 'error');
}
export async function indexChanges(data: Collected, reader: Pick<GitReader, 'ancestor'>, signal?: AbortSignal): Promise<ChangeGroup[]> {
  const groups = new Map<string, ChangeGroup>();
  for (const doc of data.documents) {
    const m = /^docs\/project\/(changes|archive)\/([^/]+)\/change\.json$/.exec(doc.path); if (!m) continue;
    const directory = doc.path.slice(0, -'/change.json'.length), fallbackId = m[1] === 'archive' ? m[2].replace(/^\d{4}-\d{2}-\d{2}-/, '') : m[2];
    let raw: unknown;
    const diagnostics: Diagnostic[] = [...doc.diagnostics];
    try { raw = JSON.parse(doc.readable ? data.blobs.get(doc.blob)!.toString() : ''); }
    catch { diagnostics.push(issue('JSON_INVALID', '无法读取合法的 change.json，请查看来源文件。', doc.path)); }
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const id = identity.safeParse(object.id).success ? object.id as string : fallbackId;
    const owner = branchName.safeParse(object.branch).success ? object.branch as string : undefined;
    const parsed = changeSchema.safeParse(raw);
    if (!parsed.success && raw !== undefined) for (const e of parsed.error.issues) diagnostics.push(issue('SCHEMA_INVALID', `${e.path.join('/') || '/'}：${e.message}`, `${doc.path}#/${e.path.map(x => String(x).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`));
    const state = parsed.success ? parsed.data : null;
    const refs = data.documents.filter(d => d.branch === doc.branch && d.path.startsWith(`${directory}/`));
    const plan = refs.find(d => d.path === `${directory}/plan.md` && d.readable);
    const c: ChangeCandidate = { key: doc.id, id, title: typeof object.title === 'string' && object.title.trim() ? object.title : id, owner, branch: doc.branch, commit: doc.commit, directory, archived: m[1] === 'archive', jsonDocumentId: doc.id, documentIds: refs.map(d => d.id), state, diagnostics, validCompleted: false, taskGraph: state ? parsePlan(state, plan ? data.blobs.get(plan.blob)!.toString() : undefined, plan?.id) : { status: 'invalid', edges: {}, diagnostics: [] }, relatedSpecs: [], specReferences: [] };
    if (state) semantics(c, data);
    // Only explicit references associate Specs; title similarity never does.
    const linked = new Set<string>();
    for (const d of refs.filter(d => d.kind === 'markdown' && d.readable)) {
      const body = data.blobs.get(d.blob)!.toString();
      const paths = inspectMarkdown(body).links.flatMap(link => { const r = resolveDocumentLink(d.path, link.url); return r.kind === 'internal' ? [{ path: r.path, line: link.line }] : []; });
      paths.push(...[...body.matchAll(/docs\/project\/specs\/[a-z0-9/-]+\/spec\.md/g)].map(m => ({ path: m[0], line: body.slice(0, m.index).split('\n').length })));
      for (const {path, line} of paths) if (data.documents.some(ref => ref.branch === d.branch && ref.path === path) && /^docs\/project\/specs\/.+\/spec.md$/.test(path)) { const specId = path.slice('docs/project/specs/'.length, -'/spec.md'.length); linked.add(specId); if (!c.specReferences.some(r => r.specId === specId && r.documentId === d.id && r.line === line)) c.specReferences.push({ specId, documentId: d.id, line }); }
    }
    c.relatedSpecs = [...linked];
    if (!groups.has(id)) groups.set(id, { id, title: c.title, primary: null, candidates: [], diagnostics: [], relations: [] });
    groups.get(id)!.candidates.push(c);
  }
  for (const g of groups.values()) {
    const owns = g.candidates.filter(c => c.owner === c.branch);
    if (owns.length === 1) { g.primary = owns[0].key; g.title = owns[0].title; }
    else g.diagnostics.push(issue(owns.length ? 'OWNER_CONFLICT' : 'OWNER_MISSING', owns.length ? '存在多个声明主来源的候选，归属不可判定。' : '未找到声明主分支上的记录，只能阅读已推送副本。'));
  }
  const edges: Record<string, string[]> = {};
  for (const g of groups.values()) {
    const c = primaryRecord(g), s = c?.state; if (!c || !s) continue;
    edges[g.id] = [...(s.dependsOn ?? []), ...(s.children ?? [])];
    const links: [Relation['kind'], string][] = [...(s.dependsOn ?? []).map(x => ['dependency', x] as [Relation['kind'], string]), ...(s.children ?? []).map(x => ['child', x] as [Relation['kind'], string]), ...(s.parent ? [['parent', s.parent] as [Relation['kind'], string]] : [])];
    for (const [kind, target] of links) {
      const other = groups.get(target), t = other ? primaryRecord(other) : null;
      const r: Relation = { kind, target, exists: !!other, process: !t?.state ? 'unknown' : t.validCompleted || (kind === 'child' && t.state.status === 'cancelled' && !t.diagnostics.length) ? 'satisfied' : 'unsatisfied', ancestry: 'unknown', diagnostics: [] };
      if (!other) r.diagnostics.push('目标不存在于已推送记录中。');
      else if (!t?.state) r.diagnostics.push('目标主来源或状态不可判定。');
      if (target === s.id) r.diagnostics.push('不能引用自身。');
      if (kind === 'child' && t?.state?.parent !== s.id) r.diagnostics.push('子项未反向声明当前父 Change。');
      if (kind === 'parent' && (t?.state?.size !== 'xlarge' || !t.state.children?.includes(s.id))) r.diagnostics.push('父项未以 xlarge 声明当前子 Change。');
      if (kind === 'dependency' && target === s.parent) r.diagnostics.push('子项不能依赖等待自己完成的父项。');
      if (kind === 'child' && t?.state?.size === 'xlarge') r.diagnostics.push('不能嵌套 xlarge。');
      if (r.diagnostics.length) r.process = 'unknown';
      if (kind === 'parent') r.process = 'unknown';
      if (kind !== 'parent' && t?.validCompleted && await reader.ancestor(t.commit, c.commit, signal)) r.ancestry = 'found';
      g.relations.push(r);
    }
  }
  const cycles = cyclicNodes(edges);
  for (const g of groups.values()) {
    if (cycles.has(g.id)) { g.diagnostics.push(issue('RELATION_CYCLE', '前置与父等子关系构成循环，不能判为可执行。')); for (const r of g.relations) if (r.kind !== 'parent' && cycles.has(r.target)) { r.process = 'unknown'; r.diagnostics.push('该关系位于循环中。'); } }
    const c = primaryRecord(g);
    if (c && g.diagnostics.length) c.validCompleted = false;
    if (c?.state?.size === 'xlarge' && c.state.stage === 'close' && g.relations.some(r => r.kind === 'child' && r.process !== 'satisfied')) { c.diagnostics.push(issue('CHILDREN_UNFINISHED', '关闭中的父 Change 仍有未完成或不可判定的子项。')); c.validCompleted = false; }
  }
  // Re-evaluate prerequisites after the complete relation graph has been checked.
  for (const g of groups.values()) for (const r of g.relations) {
    const target = groups.get(r.target), c = target ? primaryRecord(target) : null;
    if (target?.diagnostics.length || (c && c.diagnostics.length)) { r.process = 'unknown'; r.ancestry = 'unknown'; }
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}
