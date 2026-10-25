#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { repository, collaborationCatalog, recordsAt, revision, remoteBranch, fetchBranch } from './repository.mjs';
import { closedRecord, validBranchName } from './routing.mjs';
import { validateChange } from './state-schema.mjs';
import { validChangeId } from './integration-records.mjs';
import { entryPath } from '../prototype/scripts/contract.mjs';

const assert = (value, message) => { if (!value) throw Error(message); };
const at = (path, args) => execFileSync('git', ['-C', path, '--literal-pathspecs', ...args], {
  encoding:'utf8', stdio:['ignore','pipe','pipe'], maxBuffer:32 * 1024 * 1024,
}).trimEnd();
const ancestor = (repo, before, after) => {
  try { repo.git(['merge-base','--is-ancestor',before,after]); return true; } catch (error) { if (error.status === 1) return false; throw error; }
};

// Shared namespace with state/workspace commands; keep it until async scans finish.
export async function withRepositoryLock(repo, operation) {
  const path = join(repo.common, 'spec-trail-state.lock');
  mkdirSync(path);
  try {
    writeFileSync(join(path,'owner.json'), JSON.stringify({pid:process.pid,hostname:hostname(),root:repo.root,startedAt:new Date().toISOString()}));
    return await operation();
  } finally { rmSync(path, {recursive:true,force:true}); }
}

function worktrees(repo) {
  return repo.git(['worktree','list','--porcelain','-z']).split('\0\0').filter(Boolean).map(block => {
    const fields = block.split('\0');
    const value = name => fields.find(field => field.startsWith(name + ' '))?.slice(name.length + 1);
    return {path:value('worktree'),branch:value('branch')?.replace(/^refs\/heads\//,''),
      locked:fields.some(field => /^locked(?: |$)/.test(field)),prunable:fields.some(field => /^prunable(?: |$)/.test(field))};
  });
}

function visibleIndex(path) {
  const entries = at(path,['ls-files','-v','-z']).split('\0').filter(Boolean);
  assert(!entries.some(entry => entry[0] === 'S' || /^[a-z]/.test(entry)), 'Worktree has assume-unchanged or skip-worktree index entries; clear these flags and inspect files before retrying');
}

function archived(repo, commit, id) {
  const rows = recordsAt(repo, commit, id), record = rows[0];
  assert(rows.length === 1 && !record.error && record.archived && record.state?.id === id &&
    !validateChange(record.state).length && closedRecord(record.state,record.directory), 'Source must contain one valid completed archive');
  return record;
}

function sourceBranch(catalog, branch) {
  assert(validBranchName(branch) && branch !== catalog.branch && catalog.config.releaseBranch !== branch, 'The source cannot be the integration or release branch');
}

function previewObjects(repo, record, commit, configuration) {
  for (const preview of record.state.previews ?? []) {
    assert(revision(repo, preview.artifact.sourceCommit), `Prototype source object is unavailable: ${preview.id}`);
    if (preview.artifact.type === 'git') {
      const path = entryPath(preview,configuration,record.directory);
      assert(path?.startsWith(record.directory + '/previews/'), `Prototype path is outside the archived snapshot: ${preview.id}`);
      const row = repo.git(['ls-tree',commit,'--',path]);
      assert(/^(100644|100755) blob [a-f0-9]+\t/.test(row), `Prototype HTML is unavailable: ${preview.id}`);
    }
  }
}

function sourceIdentity(catalog, id) {
  const route = catalog.routes.find(route => route.id === id);
  assert(route && !route.errors.length, 'A valid central Change entry is required to identify its source');
  const record = catalog.entries.find(record => record.id === id);
  const branch = route.kind === 'archive' ? record.state.branch : route.branch;
  sourceBranch(catalog,branch);
  return {route,record,branch};
}

function localSource(repo, branch) {
  const ref = `refs/heads/${branch}`;
  try { repo.git(['show-ref','--verify','--quiet',ref]); }
  catch (error) { if (error.status === 1) return null; throw error; }
  return repo.git(['show-ref','--verify','--hash',ref]);
}

// Source inclusion and diff availability are independent facts.
function inclusion(repo, catalog, id) {
  const {branch} = sourceIdentity(catalog,id);
  const remote = remoteBranch(repo,branch);
  if (remote) assert(fetchBranch(repo,branch) === remote, 'Remote source tip changed; retry verification');
  const local = localSource(repo,branch);
  const tips = [...new Set([remote,local].filter(Boolean))];
  return {remoteVerified:true,integrationBranch:catalog.branch,tip:catalog.commit,
    source:{branch,remote,local},sourceAbsent:tips.length === 0,
    sourceIncluded:tips.length ? tips.every(tip => ancestor(repo,tip,catalog.commit)) : null};
}

function source(repo, catalog, id) {
  const route = catalog.routes.find(route => route.id === id);
  assert(route && !route.errors.length && route.kind === 'target', 'Register the archived source branch on the integration branch first');
  const branch = route.branch;
  sourceBranch(catalog, branch);
  const local = localSource(repo,branch);
  const commit = local ?? fetchBranch(repo, branch);
  const record = archived(repo,commit,id);
  assert(record.state.branch === branch, 'Archive ownership does not match the registered source');
  previewObjects(repo,record,commit,catalog.config.prototype);
  for (const tree of worktrees(repo).filter(tree => tree.branch === branch)) {
    visibleIndex(tree.path);
    assert(!tree.locked && !tree.prunable && !at(tree.path,['status','--porcelain','--untracked-files=all']), 'Source worktree is unavailable, locked or has unsaved files');
  }
  return {branch,commit,local};
}

/** Read-only remote checks (fetches tracking refs), without pushing or deleting. */
export async function preflight(repo, id) {
  assert(validChangeId(id), 'Invalid Change id');
  const catalog = collaborationCatalog(repo, {refresh:true});
  if (sourceIdentity(catalog,id).route.kind === 'archive') return inclusion(repo,catalog,id);
  const result = {integrationBranch:catalog.branch,tip:catalog.commit,
    mergeMessage:`Merge Change ${id} into ${catalog.branch}\n\nSpecTrail-Change: ${id}`};
  const delivery = source(repo,catalog,id);
  assert(remoteBranch(repo,delivery.branch) === delivery.commit, 'Push the archived source before preparing its PR');
  return {...result,source:delivery,sourceIncluded:ancestor(repo,delivery.commit,catalog.commit)};
}

/** Verify source inclusion in remote Git history, independently of PR/diff metadata. */
export async function verify(repo, id) {
  assert(validChangeId(id), 'Invalid Change id');
  const result = inclusion(repo,collaborationCatalog(repo, {refresh:true}),id);
  assert(result.sourceIncluded !== false, 'Remote integration branch does not contain all current source commits; retain the source');
  return result;
}

function dependencies(catalog, branch, id) {
  assert(!catalog.routes.some(route => route.errors.length), 'Invalid central routing prevents safe source cleanup');
  assert(!catalog.routes.some(route => route.id !== id && route.kind !== 'archive' && route.branch === branch), 'Another live/cancelled Change still depends on the source branch');
}

function treeReady(repo, branch, idleWorktree) {
  const trees = worktrees(repo), matches = trees.filter(tree => tree.branch === branch);
  assert(matches.length <= 1, 'Multiple worktrees claim the source branch');
  const tree = matches[0];
  if (!tree) return null;
  assert(tree.path !== trees[0].path, 'The primary worktree is protected');
  assert(!tree.locked && !tree.prunable && existsSync(tree.path), 'Source worktree is locked or unavailable');
  assert(idleWorktree && realpathSync(idleWorktree) === realpathSync(tree.path), 'Confirm source sessions and services are idle with --idle-worktree <path>');
  assert(realpathSync(repo.root) !== realpathSync(tree.path), 'Run cleanup outside the source worktree');
  assert(at(tree.path,['rev-parse','--path-format=absolute','--git-common-dir']) === repo.common && at(tree.path,['symbolic-ref','--short','HEAD']) === branch, 'Worktree repository/branch identity changed');
  const gitdir = at(tree.path,['rev-parse','--absolute-git-dir']);
  for (const name of ['index.lock','HEAD.lock','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_START'])
    assert(!existsSync(join(gitdir,name)), `Worktree has an active Git operation: ${name}`);
  visibleIndex(tree.path);
  assert(!at(tree.path,['status','--porcelain','--untracked-files=all','--ignored=matching']), 'Worktree contains unsaved or ignored files; preserve private data and remove only known rebuildable outputs before retrying');
  return tree;
}

/** Cleanup is separate so project deployment and artifact validation happen first.
 * @param {{idleWorktree?:string,verifiedCommit?:string}} options
 */
export async function cleanup(repo, id, options = {}) {
  assert(validChangeId(id), 'Invalid Change id');
  return withRepositoryLock(repo, async () => {
    const catalog = collaborationCatalog(repo, {refresh:true});
    const {route,branch} = sourceIdentity(catalog,id);
    const result = {...inclusion(repo,catalog,id),cleanup:{
      remote:{status:'retained',reason:'Preflight not complete'},worktree:{status:'retained',reason:'Preflight not complete'},branch:{status:'retained',reason:'Preflight not complete'},
    }};
    let remote, local, tree;
    const precheck = () => {
      assert(route.kind === 'archive', 'Complete the Change archive on the integration branch before cleanup');
      assert(typeof options.verifiedCommit === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options.verifiedCommit) &&
        ancestor(repo,options.verifiedCommit,catalog.commit), 'Validate project delivery/service and artifacts, then pass --verified-commit <included delivery commit>');
      dependencies(catalog,branch,id);
      tree = treeReady(repo,branch,options.idleWorktree);
      remote = result.source.remote;
      assert(!remote || ancestor(repo,remote,options.verifiedCommit), 'Remote source has new/unmerged work');
      local = localSource(repo,branch);
      assert(!local || ancestor(repo,local,options.verifiedCommit), 'Local source has new/unmerged work');
      assert(ancestor(repo,options.verifiedCommit,revision(repo,'HEAD') ?? ''), 'Run cleanup from a checkout containing the verified delivery');
      assert(!existsSync(join(repo.common,'packed-refs.lock')) && !existsSync(join(repo.common,`refs/heads/${branch}.lock`)), 'Source refs are locked');
    };
    try { precheck(); }
    catch (error) { for (const item of Object.values(result.cleanup)) item.reason = error.message; return result; }
    try {
      if (remote) repo.git(['push',`--force-with-lease=refs/heads/${branch}:${remote}`,'origin',`:refs/heads/${branch}`]);
      assert(remoteBranch(repo,branch) === null, 'Remote source still exists or was recreated');
      result.cleanup.remote = {status:'cleaned',reason:remote ? 'Deleted with expected tip' : 'Already absent'};
    } catch (error) { result.cleanup.remote = {status:'failed',reason:error.message}; return result; }
    try {
      // Recheck local state immediately before each destructive step.
      assert(localSource(repo,branch) === local, 'Local source tip changed');
      tree = treeReady(repo,branch,options.idleWorktree);
      if (tree) repo.git(['worktree','remove',tree.path]);
      result.cleanup.worktree = {status:'cleaned',reason:tree ? 'Removed clean idle worktree' : 'Already absent'};
    } catch (error) { result.cleanup.worktree = {status:'failed',reason:error.message}; return result; }
    try {
      assert(localSource(repo,branch) === local && !worktrees(repo).some(tree => tree.branch === branch), 'Local source changed or was checked out');
      if (local) repo.git(['branch','-d',branch]);
      result.cleanup.branch = {status:'cleaned',reason:local ? 'Deleted merged branch' : 'Already absent'};
    } catch (error) { result.cleanup.branch = {status:'failed',reason:error.message}; }
    return result;
  });
}

async function main() {
  const {values,positionals} = parseArgs({allowPositionals:true,options:{
    repo:{type:'string',default:'.'},change:{type:'string'},'idle-worktree':{type:'string'},'verified-commit':{type:'string'},
  }});
  const repo = repository(values.repo), id = values.change;
  const command = positionals[0];
  assert(positionals.length === 1 && ['preflight','verify','cleanup'].includes(command), 'Usage: integration.mjs preflight|verify|cleanup --change <id> [--repo <checkout>]');
  const output = command === 'preflight' ? await preflight(repo,id) : command === 'verify' ? await verify(repo,id) :
    await cleanup(repo,id,{idleWorktree:values['idle-worktree'],verifiedCommit:values['verified-commit']});
  process.stdout.write(JSON.stringify(output,null,2) + '\n');
  if (output.cleanup && Object.values(output.cleanup).some(item => item.status !== 'cleaned')) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
