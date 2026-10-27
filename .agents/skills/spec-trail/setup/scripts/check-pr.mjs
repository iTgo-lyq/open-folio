#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { recordsAt } from '../../scripts/repository.mjs';
import { validateChange, validateWorkflow } from '../../scripts/state-schema.mjs';
import { closedRecord, validBranchName, parentBranch } from '../../scripts/routing.mjs';
import { prMarker } from '../../scripts/pr-markers.mjs';
import { changePullRequests, deliveryPullRequests, integrationEvidence } from '../../scripts/integration-records.mjs';
import { githubPullRequests } from '../../scripts/github-prs.mjs';

const assert = (value, message) => { if (!value) throw Error(message); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value);

function archive(records, id) {
  const rows = records.filter(record => record.id === id), record = rows[0];
  assert(rows.length === 1 && !record.error && record.archived && record.state?.id === id &&
    !validateChange(record.state).length && closedRecord(record.state, record.directory),
  `Change ${id}: merge requires one valid completed archive with verification, acceptance and Specs recorded`);
  assert((record.state.previews ?? []).every(preview => preview.artifact.type !== 'git' ||
    preview.artifact.path === `${record.directory}/previews/${preview.id}`),
  `Change ${id}: Git prototypes must be fixed inside the archive subtree`);
  return record;
}

/** Read only the PR's fixed Git objects; never fetch, execute project code or change state. */
export async function checkPullRequest(git, event, readPullRequests = githubPullRequests) {
  const pr = event?.pull_request;
  assert(pr && sha(pr.head?.sha) && sha(pr.base?.sha) &&
    validBranchName(pr.head?.ref) && validBranchName(pr.base?.ref), 'Invalid PR source or target');
  assert(Number.isSafeInteger(event.repository?.id) && event.repository.id > 0 &&
    pr.head.repo?.id === event.repository.id && pr.base.repo?.id === event.repository.id,
  'SpecTrail delivery requires a same-repository PR');
  assert(git(['rev-parse', 'HEAD']) === pr.head.sha, 'Check out the exact PR head SHA before validation');
  const config = JSON.parse(git(['show', `${pr.head.sha}:docs/project/workflow.json`]));
  const issues = validateWorkflow(config);
  assert(!issues.length, `Invalid workflow.json: ${issues.join('; ')}`);
  const marker = prMarker(pr.body ?? '');
  const records = recordsAt({git}, pr.head.sha);
  const centralTip = pr.base.ref === config.integrationBranch ? pr.base.sha :
    git(['rev-parse','--verify',`refs/remotes/origin/${config.integrationBranch}^{commit}`]);
  const central = recordsAt({git}, centralTip);
  const collectionCache = new Map();
  const collection = async base => {
    if (!collectionCache.has(base)) collectionCache.set(base, readPullRequests({git},base));
    const result = await collectionCache.get(base);
    assert(result.repositoryId === String(event.repository.id), 'PR collection repository does not match the event');
    return result.pullRequests;
  };
  const ancestor = async (before, after) => {
    try { git(['merge-base','--is-ancestor',before,after]); return true; }
    catch (error) { if (error.status === 1) return false; throw error; }
  };
  const evidence = async (state, parent, tip) => {
    const direct = await collection(config.integrationBranch);
    const legacy = parent?.branch === config.integrationBranch && changePullRequests(direct,{repositoryId:String(event.repository.id),integrationBranch:config.integrationBranch,id:state.id,branch:state.branch}).some(pr => pr.state === 'merged');
    const target = state.parent && !legacy ? parentBranch(state,parent,config.integrationBranch,config.releaseBranch) : config.integrationBranch;
    const prs = [...direct, ...(target !== config.integrationBranch ? await collection(target) : [])];
    const unique = [...new Map(prs.map(pr => [pr.number,pr])).values()];
    return integrationEvidence(ancestor,tip,deliveryPullRequests(unique,{
      repositoryId:String(event.repository.id),integrationBranch:config.integrationBranch,
      parentBranch:target,id:state.id,branch:state.branch}));
  };
  if (pr.base.ref === config.releaseBranch)
    assert(marker.kind === 'release', 'Release PR requires trailing SpecTrail-Version and SpecTrail-Includes markers');
  const registeredSource = central.some(row => !row.archived && row.state?.branch === pr.head.ref && pr.head.ref !== config.integrationBranch);
  if (pr.base.ref !== config.releaseBranch && (marker.kind === 'change' || pr.base.ref === config.integrationBranch || registeredSource)) {
    assert(marker.kind === 'change', 'Change PR requires one trailing SpecTrail-Change marker');
    assert(pr.head.ref !== config.integrationBranch && pr.head.ref !== config.releaseBranch,
      'Change PR must come from its registered work branch');
    const record = archive(records, marker.id);
    assert(record.state.branch === pr.head.ref, 'Archive ownership does not match the PR source branch');
    const registration = central.filter(row => row.id === marker.id);
    assert(registration.length === 1 && !registration[0].error && !registration[0].archived &&
      registration[0].state?.id === marker.id && registration[0].state.branch === pr.head.ref &&
      registration[0].state.parent === record.state.parent,
    'Register this Change source branch on the integration branch before merging');
    const before = recordsAt({git}, pr.base.sha);
    let target = config.integrationBranch;
    if (record.state.parent) {
      const parentRows = before.filter(row => row.id === record.state.parent);
      const parent = parentRows.length === 1 && !parentRows[0].error ? parentRows[0].state : null;
      const parentEntry = central.find(row => row.id === record.state.parent);
      assert(parent && !validateChange(parent).length && parent.status === 'active' &&
        !parentRows[0].archived && parentEntry?.state?.branch === parent.branch,
        'Child PR requires its active registered parent as target');
      target = parentBranch(record.state,parent,config.integrationBranch,config.releaseBranch);
    }
    assert(pr.base.ref === target, 'Change PR target does not match its parent or configured delivery branch');
    const expected = new Set([marker.id]);
    if (record.state.size === 'xlarge') {
      for (const id of record.state.children ?? []) {
        const rows = records.filter(row => row.id === id), child = rows[0];
        assert(rows.length === 1 && !child.error && child.state?.parent === marker.id, `Child ${id}: missing or invalid parent relationship`);
        if (!child.archived) {
          const entry = central.find(row => row.id === id);
          assert(entry?.state?.branch === child.state.branch, `Child ${id}: invalid cancellation source`);
          const cancelled = recordsAt({git},`refs/remotes/origin/${child.state.branch}`,id);
          assert(cancelled.length === 1 && !cancelled[0].error && !validateChange(cancelled[0].state).length &&
            cancelled[0].state.status === 'cancelled' && cancelled[0].state.parent === marker.id,
            `Child ${id}: must be completed or cancelled`);
          continue;
        }
        archive(records,id);
        const integrated = await evidence(child.state,record.state,pr.head.sha);
        assert(integrated.status === 'found', `Child ${id}: requires verified parent PR integration`);
        expected.add(id);
      }
    }
    const existing = new Set(before.filter(row => row.archived).map(row => row.id));
    const added = records.filter(row => row.archived && !existing.has(row.id));
    const introduced = [...expected].filter(id => !existing.has(id));
    assert(added.length === introduced.length && added.every(row => introduced.includes(row.id)),
      'A Change PR must introduce exactly its own archive and completed children');
    for (const old of before.filter(row => row.archived))
      assert(git(['rev-parse',`${pr.base.sha}:${old.directory}`]) === git(['rev-parse',`${pr.head.sha}:${old.directory}`]),
        `Change ${old.id}: integrated archives are read-only`);
    return {kind:'change', changes:[...expected], source:pr.head.sha};
  }
  if (pr.base.ref !== config.releaseBranch) return {kind:'unrelated', changes:[], source:pr.head.sha};
  assert(marker.kind === 'release', 'Release PR requires trailing SpecTrail-Version and SpecTrail-Includes markers');
  const integrationTip = git(['rev-parse', '--verify', `refs/remotes/origin/${config.integrationBranch}^{commit}`]);
  for (const id of marker.includes) {
    const record = archive(records, id);
    const parent = record.state.parent ? records.find(row => row.id === record.state.parent)?.state : null;
    const integration = await evidence(record.state,parent,integrationTip);
    assert(integration.status === 'found', `Change ${id}: release requires verified integration history`);
    assert(git(['merge-base', integration.commit, pr.head.sha]) === integration.commit,
      `Change ${id}: integrated delivery is not in the release candidate`);
    const delivered = archive(recordsAt({git}, integration.commit), id);
    assert(record.directory === delivered.directory &&
      git(['rev-parse', `${pr.head.sha}:${record.directory}`]) ===
      git(['rev-parse', `${integration.commit}:${record.directory}`]),
    `Change ${id}: release candidate modified its integrated archive`);
  }
  return {kind:'release', changes:marker.includes, source:pr.head.sha};
}

async function main() {
  const {values} = parseArgs({options:{repo:{type:'string',default:'.'},event:{type:'string'}}});
  const eventPath = values.event ?? process.env.GITHUB_EVENT_PATH;
  assert(eventPath, 'Provide --event <PR event JSON> or GITHUB_EVENT_PATH');
  const git = args => execFileSync('git', ['-C', resolve(values.repo), '--literal-pathspecs', ...args], {
    encoding:'utf8', stdio:['ignore','pipe','pipe'], maxBuffer:32 * 1024 * 1024,
  }).trimEnd();
  const result = await checkPullRequest(git, JSON.parse(readFileSync(eventPath, 'utf8')));
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(`SpecTrail: ${error.message}\n`); process.exitCode = 1; });
