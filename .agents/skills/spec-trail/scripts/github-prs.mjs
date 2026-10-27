import { execFileSync } from 'node:child_process';
import { changePullRequests, integrationEvidence } from './integration-records.mjs';
import { prMarker } from './pr-markers.mjs';
import { deliveryTarget } from './repository.mjs';

const assert = (value, message) => { if (!value) throw Error(message); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value);
const repoId = value => Number.isSafeInteger(value) && value > 0;

/** Read-only GitHub adapter. gh owns authentication; no credentials are read or saved here.
 * @param {{git:(args:string[])=>string}} repo @param {string} base
 * @param {(args:string[])=>string|Promise<string>} [request]
 * @returns {Promise<{repositoryId:string,pullRequests:import('./integration-records.mjs').ChangePullRequest[]}>}
 */
export async function githubPullRequests(repo, base, request = args => execFileSync('gh', args, {
  encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:30_000, maxBuffer:32 * 1024 * 1024,
})) {
  const remote = repo.git(['config','--get','remote.origin.url']);
  const url = new URL(remote.replace(/^git@([^:]+):/, 'ssh://git@$1/'));
  assert(['https:','ssh:'].includes(url.protocol) && /^[a-z0-9.-]+$/i.test(url.hostname), 'PR verification requires a GitHub HTTPS or SSH origin');
  const name = url.pathname.replace(/^\//,'').replace(/\.git$/,'');
  assert(/^[\w.-]+\/[\w.-]+$/.test(name), 'Invalid GitHub repository path');
  const api = async path => {
    let text;
    try { text = await request(['api','--hostname',url.hostname,path]); }
    catch { throw Error('GitHub PR records unavailable; check gh installation, authentication, pull request read permission and network'); }
    return JSON.parse(text);
  };
  const repository = await api(`repos/${name}`);
  assert(repoId(repository.id) && repository.full_name?.toLowerCase() === name.toLowerCase(), 'GitHub repository identity does not match origin');
  const pullRequests = [], seen = new Set();
  let bytes = 0;
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({base,state:'all',sort:'created',direction:'desc',per_page:'100',page:String(page)});
    const rows = await api(`repos/${name}/pulls?${params}`);
    assert(Array.isArray(rows) && rows.length <= 100, 'Incomplete GitHub PR page');
    bytes += Buffer.byteLength(JSON.stringify(rows));
    assert(bytes <= 32 * 1024 * 1024, 'GitHub PR collection exceeds the read limit');
    for (const p of rows) {
      assert(Number.isSafeInteger(p.number) && p.number > 0 && !seen.has(p.number) &&
        ['open','closed'].includes(p.state) && (p.body === null || typeof p.body === 'string') &&
        (p.merged_at === null || (typeof p.merged_at === 'string' && Number.isFinite(Date.parse(p.merged_at)))) &&
        typeof p.head?.ref === 'string' && typeof p.base?.ref === 'string' &&
        sha(p.head.sha) && sha(p.base.sha) && repoId(p.base.repo?.id) &&
        (p.head.repo === null || repoId(p.head.repo?.id)) &&
        (p.merge_commit_sha === null || sha(p.merge_commit_sha)), 'Incomplete or inconsistent GitHub PR records');
      seen.add(p.number);
      pullRequests.push({number:p.number,marker:prMarker(p.body ?? ''),state:p.merged_at ? 'merged' : p.state,
        base:{repositoryId:String(p.base.repo.id),branch:p.base.ref,commit:p.base.sha},
        head:{repositoryId:p.head.repo ? String(p.head.repo.id) : null,branch:p.head.ref,commit:p.head.sha},
        mergeCommit:p.merged_at ? p.merge_commit_sha : null});
    }
    if (rows.length < 100) break;
  }
  return {repositoryId:String(repository.id),pullRequests};
}

export async function changeDelivery(repo, catalog, id, branch, read = githubPullRequests) {
  const state = catalog.entries.find(row => row.id === id)?.state;
  const central = await read(repo,catalog.branch);
  const direct = changePullRequests(central.pullRequests,{repositoryId:central.repositoryId,integrationBranch:catalog.branch,id,branch});
  let target = {branch:catalog.branch, readBranch:catalog.branch, commit:catalog.commit, ref:catalog.ref};
  let prs = direct;
  if (state?.parent) {
    const parent = catalog.entries.find(row => row.id === state.parent)?.state;
    // Historical children may already have shipped before the parent was handed off.
    if (!(parent?.branch === catalog.branch && direct.some(pr => pr.state === 'merged'))) {
      target = deliveryTarget(repo,catalog,state,{refresh:true});
      const collection = await read(repo,target.branch);
      assert(collection.repositoryId === central.repositoryId, 'Parent PR repository does not match');
      const nested = changePullRequests(collection.pullRequests,{repositoryId:central.repositoryId,integrationBranch:target.branch,id,branch});
      prs = [...direct.filter(pr => pr.state === 'merged'), ...nested];
      if (direct.some(pr => pr.state === 'merged') && !nested.some(pr => pr.state === 'merged'))
        target = {branch:catalog.branch, readBranch:catalog.branch, commit:catalog.commit, ref:catalog.ref};
    }
  }
  const integration = await integrationEvidence(async (before,after) => {
    try { repo.git(['merge-base','--is-ancestor',before,after]); return true; }
    catch (error) { if (error.status === 1) return false; throw error; }
  },target.commit,prs);
  return {target,integration};
}

export async function changeIntegration(repo, catalog, id, branch, read = githubPullRequests) {
  return (await changeDelivery(repo,catalog,id,branch,read)).integration;
}
