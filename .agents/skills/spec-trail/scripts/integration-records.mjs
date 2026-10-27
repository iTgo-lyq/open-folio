import { prMarker } from './pr-markers.mjs';
import { changeLocation } from './routing.mjs';

export const INTEGRATION_VERSION = 3;
export const validChangeId = (id) => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const sha = (value) => /^[a-f0-9]{40,64}$/.test(value);
const format = '%H%x00%P%x00%cI%x00%s%x00';
/** @typedef {{status:'found', commit:string, base:string, source:string, archivePath:string, title:string, committedAt:string}} IntegrationRecord */
/** @typedef {IntegrationRecord | {status:'missing'|'invalid'|'unavailable', message:string, candidates?:string[]}} IntegrationResult */
/** @typedef {{version:number, tip:string|null, complete:boolean, records:Record<string,IntegrationResult>, issues:string[], message?:string}} IntegrationIndex */
/** @typedef {(args:string[]) => Promise<Buffer|string>} GitRun */

/** @typedef {{number:number,state:string,mergeCommit:string|null,base:{repositoryId:string,branch:string},head:{repositoryId:string|null,branch:string},body?:string,marker?:ReturnType<typeof prMarker>}} ChangePullRequest */
/** Exact PR association; commit messages are never association metadata.
 * @template {ChangePullRequest} T @param {T[]} prs
 * @param {{repositoryId:string,integrationBranch:string,id:string,branch:string}} identity
 * @returns {T[]}
 */
export function changePullRequests(prs, {repositoryId, integrationBranch, id, branch}) {
  return prs.filter(pr => {
    const marker = pr.marker ?? prMarker(pr.body ?? '');
    return pr.base.repositoryId === repositoryId && pr.head.repositoryId === repositoryId &&
      pr.base.branch === integrationBranch && pr.head.branch === branch &&
      marker.kind === 'change' && marker.id === id;
  });
}

/** Include old direct deliveries only when they really merged; new child PRs target the parent.
 * @template {ChangePullRequest} T @param {T[]} prs
 * @param {{repositoryId:string,integrationBranch:string,parentBranch?:string,id:string,branch:string}} identity
 * @returns {T[]}
 */
export function deliveryPullRequests(prs, identity) {
  const direct = changePullRequests(prs, identity);
  if (!identity.parentBranch || identity.parentBranch === identity.integrationBranch) return direct;
  return [...direct.filter(pr => pr.state === 'merged'),
    ...changePullRequests(prs, {...identity,integrationBranch:identity.parentBranch})];
}

/** @typedef {{status:'found', commit:string} | {status:'missing'|'invalid'|'unavailable',message:string,candidates?:string[]}} IntegrationEvidence */
/** Resolve already-associated PRs independently of diff availability.
 * @param {(before:string,after:string)=>Promise<boolean>} ancestor
 * @param {string|null} tip @param {Array<{state:string,mergeCommit:string|null}>} prs
 * @returns {Promise<IntegrationEvidence>}
 */
export async function integrationEvidence(ancestor, tip, prs) {
  const merged = prs.filter(pr => pr.state === 'merged');
  if (!merged.length) return {status:'missing',message:'暂无已合并的关联 PR'};
  if (merged.length !== 1) return {status:'invalid',message:'存在多个已合并的关联 Change PR，无法唯一确定交付。',candidates:merged.flatMap(pr => pr.mergeCommit ? [pr.mergeCommit] : [])};
  const commit = merged[0].mergeCommit;
  if (!sha(tip) || !sha(commit)) return {status:'unavailable',message:'PR 合并提交或集成版本尚不可读取。'};
  try {
    if (await ancestor(commit, tip)) return {status:'found',commit};
    return {status:'unavailable',message:'PR 已合并，但合并提交尚未进入当前集成版本。',candidates:[commit]};
  } catch {
    return {status:'unavailable',message:'PR 合并提交的 Git 历史暂不可读取。',candidates:[commit]};
  }
}

function commits(output) {
  const parts = output.toString().split('\0');
  if (parts.pop().trim()) throw Error('Incomplete commit metadata');
  if (parts.length % 4) throw Error('Invalid commit metadata');
  const result = [];
  for (let i = 0; i < parts.length; i += 4) {
    const commit = parts[i].trim(), parents = parts[i + 1].split(' ').filter(Boolean);
    if (!sha(commit) || !parents.every(sha)) throw Error('Invalid commit identity');
    result.push({commit, parents, committedAt:parts[i + 2], title:parts[i + 3]});
  }
  return result;
}

/** @param {GitRun} run */
function validator(run) {
  const catalogs = new Map();
  async function catalog(commit) {
    if (catalogs.has(commit)) return catalogs.get(commit);
    const rows = (await run(['ls-tree', '-rz', '--full-tree', commit, '--', 'docs/project/changes/', 'docs/project/archive/'])).toString().split('\0');
    const records = rows.flatMap(row => {
      const tab = row.indexOf('\t'); if (tab < 0) return [];
      const path = row.slice(tab + 1), location = changeLocation(path);
      if (!location) return [];
      const [mode, type, blob] = row.slice(0, tab).split(' ');
      return [{...location, path, mode, type, blob}];
    });
    catalogs.set(commit, records); return records;
  }
  /** @returns {Promise<IntegrationResult>} */
  return async (meta, id) => {
    const invalid = (message) => ({status: /** @type {const} */('invalid'), message, candidates:[meta.commit]});
    if (meta.parents.length !== 2) return invalid('合入差异需要恰有两个父提交的合并提交。');
    try {
      const [base, source] = meta.parents;
      const own = (await catalog(meta.commit)).filter(entry => entry.id === id && entry.archived);
      if (own.length !== 1 || own[0].type !== 'blob' || !['100644','100755'].includes(own[0].mode))
        return invalid('合并提交没有可唯一定位的 Change 归档目录。');
      const path = own[0].directory;
      return {status:'found',commit:meta.commit,base,source,archivePath:path,title:meta.title,committedAt:meta.committedAt};
    } catch {
      return {status:'unavailable', message:'合入记录所需的 Git 对象暂不可读取，请重新获取历史后重试。', candidates:[meta.commit]};
    }
  };
}

/** Locate one Change's immutable merge diff. Archive policy belongs to pre-merge CI.
 * @param {GitRun} run @param {string} commit @param {string} id
 * @returns {Promise<IntegrationResult>}
 */
export async function inspectIntegration(run, commit, id) {
  if (!sha(commit) || !validChangeId(id)) throw Error('Invalid integration identity');
  try {
    const [meta] = commits(await run(['log','-1',`--format=${format}`,commit,'--']));
    return await validator(run)(meta, id);
  } catch { return {status:'unavailable',message:'合入提交暂不可读取。',candidates:[commit]}; }
}

/** @param {IntegrationIndex} index @param {string} id @returns {IntegrationResult} */
export function integrationFor(index, id) {
  if (!validChangeId(id)) throw Error('Invalid Change id');
  if (!index?.complete) return {status:'unavailable',message:index?.message ?? '合入索引暂不可读取。'};
  return Object.hasOwn(index.records,id) ? index.records[id] : {status:'missing',message:'暂无合入记录'};
}
