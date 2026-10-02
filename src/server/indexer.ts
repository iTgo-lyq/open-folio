import type { DocumentRef, ProjectConfig, Snapshot } from '../lib/model.ts';
import type { GitReader } from './git.ts';
import { z } from 'zod';
export type Collected = Awaited<ReturnType<GitReader['collect']>>;
export function indexBase(data: Collected, project: ProjectConfig) {
  const diagnostics: Snapshot['diagnostics'] = [];
  const workflow = data.documents.find(d => d.branch === data.defaultBranch && d.path === 'docs/project/workflow.json');
  let protectedBranches: string[] = [];
  const schema = z.object({ schemaVersion: z.literal(1), protectedBranches: z.array(z.string().min(1).refine(s => !s.startsWith('refs/') && !s.startsWith('origin/') && !/[\s~^:?*\[\\]|\.\.|@\{|\/\/|^\/|\/$|\.$|\.lock(?:\/|$)/.test(s))).nonempty().refine(a => new Set(a).size === a.length) }).strict();
  try { protectedBranches = schema.parse(JSON.parse(workflow?.readable ? data.blobs.get(workflow.blob)!.toString() : '')).protectedBranches; }
  catch { diagnostics.push({ code: 'WORKFLOW_INVALID', message: '远端默认分支缺少有效的 workflow.json，尚未确定稳定 Specs 来源。', path: 'docs/project/workflow.json', severity: 'warning' }); }
  const requested = project.specBranch ?? data.defaultBranch;
  const specBranch = requested && protectedBranches.includes(requested) && data.branches.some(b => b.name === requested) ? requested : null;
  if (!specBranch) diagnostics.push({ code: 'SPEC_BASELINE_UNKNOWN', message: '未找到已登记的默认守护分支，请显式选择阅读来源。', severity: 'warning' });
  const specs = data.documents.flatMap((d: DocumentRef) => {
    const m = /^docs\/project\/specs\/([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)\/spec\.md$/.exec(d.path);
    return m ? [{ id: m[1], title: d.title, branch: d.branch, documentId: d.id }] : [];
  });
  return { protectedBranches, specBranch, specs, diagnostics };
}
