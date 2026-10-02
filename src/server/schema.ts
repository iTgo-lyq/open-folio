import { z } from 'zod';
export const identity = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const text = z.string().refine(s => /\S/.test(s), '不能为空白文本');
export const branchName = z.string().regex(/^[^\s~^:?*\[\\]+$/);
export function validTimestamp(value: string) {
  const p = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!p) return false;
  const [y, m, d, h, min, s] = p.slice(1, 7).map(Number), zh = Number(p[9] || 0), zm = Number(p[10] || 0);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const utcMinute = (h * 60 + min - (zh * 60 + zm) * (p[8] === '-' ? -1 : 1) + 1440) % 1440;
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && h < 24 && min < 60 && zh < 24 && zm < 60 && (s < 60 || (s < 61 && utcMinute === 1439));
}
const at = z.string().refine(validTimestamp, '必须是有效且含时区的 ISO 8601 时间');
const list = z.array(identity).refine(a => new Set(a).size === a.length, '不得重复');
const confirmation = z.object({ at, summary: text, source: text.optional() }).strict();
const step = { at, summary: text };
const commit = z.string().regex(/^[a-f0-9]{7,64}$/).optional();
export const changeSchema = z.object({
  schemaVersion: z.literal(1), id: identity, title: text, size: z.enum(['small', 'medium', 'large', 'xlarge']),
  status: z.enum(['active', 'completed', 'cancelled']), stage: z.enum(['requirement', 'technical', 'plan', 'execution', 'close']), branch: branchName,
  dependsOn: list.optional(), parent: identity.optional(), children: list.optional(),
  confirmations: z.object({ requirement: confirmation.optional(), technical: confirmation.optional(), plan: confirmation.optional(), merge: confirmation.extend({ sourceCommit: commit, targetCommit: commit, baseCommit: commit }).strict().optional() }).strict(),
  tasks: z.record(z.string().regex(/^T[1-9][0-9]*$/), z.object({ title: text, status: z.enum(['todo', 'doing', 'done', 'blocked']), branch: branchName.optional(), reason: text.optional(), verification: text.optional(), commitTitle: text.optional() }).strict().superRefine((t, ctx) => { if (t.status === 'blocked' && !t.reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: '阻塞任务必须说明解除条件' }); })),
  waitingFor: z.object({ kind: z.enum(['confirmation', 'dependency', 'pause']), summary: text }).strict().optional(),
  rework: z.object({ at, reason: text, approach: text }).strict().optional(),
  closure: z.object({ verification: z.object({ ...step, result: z.enum(['passed', 'failed']) }).strict().optional(), acceptance: z.object({ ...step, result: z.literal('accepted'), source: text.optional() }).strict().optional(), specs: z.object({ ...step, result: z.enum(['synced', 'not_needed']) }).strict().optional(), archive: z.object({ ...step, result: z.literal('done'), path: z.string().regex(/^docs\/project\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$/) }).strict().optional() }).strict(),
  cancellation: z.object({ at, reason: text }).strict().optional(),
}).strict().superRefine((s, ctx) => { if (s.status === 'cancelled' && !s.cancellation) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cancellation'], message: '已取消记录必须说明取消时间和原因' }); });
export function validDate(s: string) { return validTimestamp(`${s}T00:00:00Z`); }
