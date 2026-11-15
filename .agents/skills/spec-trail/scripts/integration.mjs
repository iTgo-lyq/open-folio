import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { repository, collaborationCatalog, routedRecord, deliveryTarget, recordsAt, revision, remoteBranch, fetchBranch } from './core/repository.mjs';
import { closedRecord, validBranchName } from './core/routing.mjs';
import { validateChange } from './core/state-schema.mjs';
import { validChangeId } from './core/integration-records.mjs';
import { changeDelivery, githubPullRequests } from './core/github-prs.mjs';
import { verifyArchivedPreviews } from './prototype/hooks.mjs';
import { withStateLock } from './core/lock.mjs';
import { define } from './define.mjs';

const assert = (value, message) => { if (!value) throw Error(message); };
const at = (path, args) => execFileSync('git', ['-C', path, '--literal-pathspecs', ...args], {
  encoding:'utf8', stdio:['ignore','pipe','pipe'], maxBuffer:32 * 1024 * 1024,
}).trimEnd();
const ancestor = (repo, before, after) => {
  try { repo.git(['merge-base','--is-ancestor',before,after]); return true; } catch (error) { if (error.status === 1) return false; throw error; }
};


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

function checkSubmoduleRemoval(path, gitdir) {
  const populated = at(path,['ls-files','--stage','-z']).split('\0')
    .filter(entry => entry.startsWith('160000 '))
    .map(entry => entry.slice(entry.indexOf('\t') + 1))
    .filter(modulePath => existsSync(join(path,modulePath,'.git')));
  const modules = join(gitdir,'modules');
  const evidence = [];
  if (populated.length) evidence.push(`initialized submodules ${populated.map(modulePath => JSON.stringify(modulePath)).join(', ')}`);
  if (statSync(modules,{throwIfNoEntry:false})?.isDirectory()) evidence.push(`submodule Git data at ${JSON.stringify(modules)}`);
  assert(!evidence.length, `Git refuses non-forced removal of source worktree ${JSON.stringify(path)} with ${evidence.join(' and ')}. ` +
    'Check submodule files, local-only commits and stashes. Obtain explicit user confirmation before running git worktree remove --force manually, then retry cleanup. ' +
    'See SKILL.md (合码与集成 → 清理 → 含子模块的 worktree).');
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

function sourceIdentity(catalog, id) {
  const route = catalog.routes.find(route => route.id === id);
  assert(route && !route.errors.length, 'A valid central Change entry is required to identify its source');
  const record = catalog.entries.find(record => record.id === id);
  assert(record.state.status !== "cancelled", "A cancelled Change has no delivery to integrate or clean up");
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
function inclusion(repo, catalog, id, target = catalog) {
  const {branch} = sourceIdentity(catalog,id);
  const remote = remoteBranch(repo,branch);
  if (remote) assert(fetchBranch(repo,branch) === remote, 'Remote source tip changed; retry verification');
  const local = localSource(repo,branch);
  const tips = [...new Set([remote,local].filter(Boolean))];
  return {remoteVerified:true,integrationBranch:target.branch,projectIntegrationBranch:catalog.branch,tip:target.commit,
    source:{branch,remote,local},sourceAbsent:tips.length === 0,
    sourceIncluded:tips.length ? tips.every(tip => ancestor(repo,tip,target.commit)) : null};
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
  verifyArchivedPreviews(repo,record,commit,catalog.config.prototype);
  for (const tree of worktrees(repo).filter(tree => tree.branch === branch)) {
    visibleIndex(tree.path);
    assert(!tree.locked && !tree.prunable && !at(tree.path,['status','--porcelain','--untracked-files=all']), 'Source worktree is unavailable, locked or has unsaved files');
  }
  return {branch,commit,local};
}

/** Read-only remote checks (fetches tracking refs), without pushing or deleting. */
export async function preflight(repo, id, readPullRequests = githubPullRequests) {
  assert(validChangeId(id), 'Invalid Change id');
  const catalog = collaborationCatalog(repo, {refresh:true});
  const {branch,route} = sourceIdentity(catalog,id);
  const {integration,target,open} = await changeDelivery(repo,catalog,id,branch,readPullRequests);
  assert(!['invalid','unavailable'].includes(integration.status), integration.message);
  if (route.kind === 'archive' || integration.status === 'found') return {...inclusion(repo,catalog,id,target),integration};
  assert(!target.parent || target.parent.status === 'active', 'The parent must be active to receive a child delivery');
  assert(open.length < 2, `发现多个相同源分支和目标分支的未合并 PR：${open.map(pr => '#' + pr.number).join('、')}`);
  const pr = open[0];
  const result = {integrationBranch:target.branch,projectIntegrationBranch:catalog.branch,tip:target.commit,integration,
    pullRequest:pr?.number ?? null};
  const delivery = source(repo,catalog,id);
  assert(remoteBranch(repo,delivery.branch) === delivery.commit, 'Push the archived source before preparing its PR');
  return {...result,source:delivery,sourceIncluded:ancestor(repo,delivery.commit,target.commit)};
}

/** Verify the PR delivery and current source inclusion independently of diff availability. */
export async function verify(repo, id, readPullRequests = githubPullRequests) {
  assert(validChangeId(id), 'Invalid Change id');
  const catalog = collaborationCatalog(repo, {refresh:true});
  const {branch} = sourceIdentity(catalog,id);
  const {integration,target} = await changeDelivery(repo,catalog,id,branch,readPullRequests);
  const result = inclusion(repo,catalog,id,target);
  if (integration.status !== 'found') throw Error(`No verified Change PR integration: ${integration.message}`);
  assert(result.sourceIncluded !== false, 'Remote integration branch does not contain all current source commits; retain the source');
  return {...result,integration};
}

function dependencies(catalog, branch, id) {
  assert(!catalog.routes.some(route => route.errors.length), 'Invalid central routing prevents safe source cleanup');
  assert(!catalog.entries.some(entry => entry.id !== id && entry.state?.branch === branch &&
    (!entry.archived || entry.state.status === "cancelled")), 'Another live/cancelled Change still depends on the source branch');
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
  assert(!at(tree.path,['status','--porcelain','--untracked-files=all','--ignored=matching','--ignore-submodules=none']), 'Worktree contains unsaved or ignored files; preserve private data and remove only known rebuildable outputs before retrying');
  checkSubmoduleRemoval(tree.path,gitdir);
  return tree;
}

/** Cleanup is separate so project deployment and artifact validation happen first.
 * @param {{idleWorktree?:string,verifiedCommit?:string}} options
 */
export async function cleanup(repo, id, options = {}) {
  assert(validChangeId(id), 'Invalid Change id');
  return withStateLock(repo.common, repo.root, async () => {
    const catalog = collaborationCatalog(repo, {refresh:true});
    const {route,branch,record} = sourceIdentity(catalog,id);
    const target = route.kind === 'archive' ? catalog : deliveryTarget(repo,catalog,record.state,{refresh:true});
    const result = {...inclusion(repo,catalog,id,target),cleanup:{
      remote:{status:'retained',reason:'Preflight not complete'},worktree:{status:'retained',reason:'Preflight not complete'},branch:{status:'retained',reason:'Preflight not complete'},
    }};
    let remote, local;
    const precheck = () => {
      const delivered = routedRecord(repo,catalog,id,{refresh:true});
      assert(delivered.archived && !delivered.errors.length && delivered.commit === target.commit,
        'Complete the Change archive on its integration target before cleanup');
      assert(typeof options.verifiedCommit === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options.verifiedCommit) &&
        ancestor(repo,options.verifiedCommit,target.commit), 'Validate project delivery/service and artifacts, then pass --verified-commit <included delivery commit>');
      dependencies(catalog,branch,id);
      remote = result.source.remote;
      assert(!remote || ancestor(repo,remote,options.verifiedCommit), 'Remote source has new/unmerged work');
      local = localSource(repo,branch);
      assert(!local || ancestor(repo,local,options.verifiedCommit), 'Local source has new/unmerged work');
      assert(ancestor(repo,options.verifiedCommit,revision(repo,'HEAD') ?? ''), 'Run cleanup from a checkout containing the verified delivery');
      assert(!existsSync(join(repo.common,'packed-refs.lock')) && !existsSync(join(repo.common,`refs/heads/${branch}.lock`)), 'Source refs are locked');
      treeReady(repo,branch,options.idleWorktree);
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
      const tree = treeReady(repo,branch,options.idleWorktree);
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

const integration = (operation, summary, { required = [], optional = [], help, notes, example = "" } = {}) =>
  define((values) => operation(repository(values.repo), values.change, values), {
    summary, required: ["change", ...required], optional: [...optional, "repo"], help, notes, example: `--change example${example}`,
  });

export const commands = {
  preflight: integration(
    async (repo, id) => ({ output: await preflight(repo, id) }),
    "After pushing the archive, check the source, delivery target and open pull request before review or merge",
  ),
  verify: integration(
    async (repo, id) => ({ output: await verify(repo, id) }),
    "Confirm the merged pull request commit is in the target history and the source is included",
  ),
  cleanup: integration(
    async (repo, id, values) => {
      const output = await cleanup(repo, id, { idleWorktree: values["idle-worktree"], verifiedCommit: values["verified-commit"] });
      const incomplete = Object.values(output.cleanup).some((item) => item.status !== "cleaned");
      return { output, exitCode: incomplete ? 2 : 0 };
    },
    "Delete the merged source branch and idle worktree after the delivery is verified",
    {
      required: ["verified-commit"],
      optional: ["idle-worktree"],
      help: {
        "verified-commit": {
          value: "full-sha",
          text: "Full 40- or 64-hex delivery commit you verified; it must be in the remote target history and contain every source tip",
        },
        "idle-worktree": { value: "dir", text: "Source worktree you confirmed is no longer in use; omit when there is none" },
      },
      notes: ["Exit code 2 when cleanup is incomplete; the JSON lists each item's status."],
      example: ' --verified-commit "$(git rev-parse origin/develop)" --idle-worktree ../project-worktrees/example',
    },
  ),
};
