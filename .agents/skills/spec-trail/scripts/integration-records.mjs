import { trailingFields } from './pr-markers.mjs';
import { changeLocation } from './routing.mjs';

export const INTEGRATION_VERSION = 2;
export const validChangeId = (id) => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const sha = (value) => /^[a-f0-9]{40,64}$/.test(value);
const format = '%H%x00%P%x00%cI%x00%s%x00%B%x00';
/** @typedef {{status:'found', commit:string, base:string, source:string, archivePath:string, title:string, committedAt:string}} IntegrationRecord */
/** @typedef {IntegrationRecord | {status:'missing'|'invalid'|'unavailable', message:string, candidates?:string[]}} IntegrationResult */
/** @typedef {{version:number, tip:string|null, complete:boolean, records:Record<string,IntegrationResult>, issues:string[], message?:string}} IntegrationIndex */
/** @typedef {(args:string[]) => Promise<Buffer|string>} GitRun */

export function changeTrailers(message) {
  return trailingFields(message).filter(field => field.key === 'SpecTrail-Change').map(field => field.value);
}

function commits(output) {
  const parts = output.toString().split('\0');
  if (parts.pop().trim()) throw Error('Incomplete commit metadata');
  if (parts.length % 5) throw Error('Invalid commit metadata');
  const result = [];
  for (let i = 0; i < parts.length; i += 5) {
    const commit = parts[i].trim(), parents = parts[i + 1].split(' ').filter(Boolean);
    if (!sha(commit) || !parents.every(sha)) throw Error('Invalid commit identity');
    result.push({commit, parents, committedAt:parts[i + 2], title:parts[i + 3], message:parts[i + 4]});
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
    const markers = changeTrailers(meta.message);
    if (markers.length !== 1 || markers[0] !== id) return invalid('合入提交的 Change 标记必须唯一且合法。');
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

/** @param {GitRun} run @param {string} tip @returns {Promise<IntegrationIndex>} */
export async function scanIntegrations(run, tip) {
  /** @type {IntegrationIndex} */
  const index = {version:INTEGRATION_VERSION,tip,complete:false,records:{},issues:[]};
  const groups = new Map(), validate = validator(run);
  try {
    if (!sha(tip)) throw Error('Invalid collaboration commit');
    if ((await run(['rev-parse','--is-shallow-repository'])).toString().trim() !== 'false') throw Error('Shallow history');
    for (let offset = 0; ; offset += 256) {
      const batch = commits(await run(['log','--merges','--max-count=256',`--skip=${offset}`,`--format=${format}`,tip,'--']));
      for (const meta of batch) {
        const markers = changeTrailers(meta.message);
        if (markers.some(id => !validChangeId(id))) index.issues.push(`${meta.commit}: Change 标记包含非法 id。`);
        for (const id of new Set(markers.filter(validChangeId))) {
          const list = groups.get(id) ?? []; list.push(meta); groups.set(id, list);
        }
      }
      if (batch.length < 256) break;
    }
    for (const [id, list] of groups) {
      const result = list.length > 1
        ? {status: /** @type {const} */('invalid'), message:'集成历史中存在多个带同一 Change 标记的合并提交，差异无法唯一定位。', candidates:list.map(meta => meta.commit)}
        : await validate(list[0], id);
      // IDs may be valid object prototype names (e.g. constructor).
      Object.defineProperty(index.records,id,{value:result,enumerable:true,writable:true,configurable:true});
    }
    index.complete = true;
  } catch { index.message = '集成分支历史读取未完成，请获取完整历史后重试。'; }
  return index;
}

/** @param {IntegrationIndex} index @param {string} id @returns {IntegrationResult} */
export function integrationFor(index, id) {
  if (!validChangeId(id)) throw Error('Invalid Change id');
  if (!index?.complete) return {status:'unavailable',message:index?.message ?? '合入索引暂不可读取。'};
  return Object.hasOwn(index.records,id) ? index.records[id] : {status:'missing',message:'暂无合入记录'};
}
