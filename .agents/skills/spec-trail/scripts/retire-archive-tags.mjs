import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { repository } from './repository.mjs';
import { withRepositoryLock } from './integration.mjs';

const prefix = 'refs/tags/spec-trail/archive-v2/';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);
const identity = repo => createHash('sha256').update(repo.git(['remote','get-url','origin'])).digest('hex');
const assert = (value,message) => {if (!value) throw Error(message);};
function refs(repo, remote) {
  const rows = repo.git(remote ? ['ls-remote','--refs','origin',`${prefix}*`] : ['for-each-ref','--format=%(objectname)%09%(refname)',prefix]);
  return new Map(rows.split('\n').filter(Boolean).map(row => {
    const [oid,ref] = row.split('\t');
    assert(sha(oid) && ref?.startsWith(prefix) && ref.length > prefix.length, 'Unexpected tag inventory');
    return [ref,oid];
  }));
}

export function inventory(repo) {
  const remote = refs(repo,true), local = refs(repo,false);
  return {version:1,repository:identity(repo),common:repo.common,refs:[...new Set([...remote.keys(),...local.keys()])].sort().map(ref => ({ref,remote:remote.get(ref) ?? null,local:local.get(ref) ?? null}))};
}

export async function retire(repo, manifest, serviceReady = false) {
  assert(serviceReady, 'Deploy and verify the new reader and confirm old archive writers have stopped before --service-ready');
  assert(manifest?.version === 1 && manifest.repository === identity(repo) && manifest.common === repo.common && Array.isArray(manifest.refs), 'Inventory does not belong to this repository');
  const seen = new Set();
  for (const item of manifest.refs) {
    assert(typeof item.ref === 'string' && item.ref.startsWith(prefix) && item.ref.length > prefix.length && !seen.has(item.ref), 'Invalid or duplicate inventory ref');
    repo.git(['check-ref-format',item.ref]);
    assert((item.remote === null || sha(item.remote)) && (item.local === null || sha(item.local)) && (item.remote || item.local), 'Invalid expected tag object');
    seen.add(item.ref);
  }
  return withRepositoryLock(repo,async () => {
    const results = [];
    for (const item of manifest.refs) {
      const output = {ref:item.ref,remote:{status:'retained',reason:'Not checked'},local:{status:'retained',reason:'Remote not verified'}};
      results.push(output);
      try {
        const actual = refs(repo,true).get(item.ref);
        if (actual && actual !== item.remote) {output.remote.reason = 'Remote tag changed after inventory'; continue;}
        let pushError;
        if (actual) try {repo.git(['push',`--force-with-lease=${item.ref}:${actual}`,'origin',`:${item.ref}`]);} catch (error) {pushError = error;}
        if (refs(repo,true).has(item.ref)) throw pushError ?? Error('Remote tag was recreated or deletion was denied');
        output.remote = {status:'cleaned',reason:actual ? 'Deleted expected tag object' : 'Already absent'};
      } catch (error) {output.remote = {status:'failed',reason:error.message}; continue;}
      try {
        const actual = refs(repo,false).get(item.ref);
        if (actual && actual !== item.local) {output.local.reason = 'Local tag changed after inventory'; continue;}
        if (actual) repo.git(['update-ref','-d',item.ref,actual]);
        output.local = {status:'cleaned',reason:actual ? 'Deleted expected tag object' : 'Already absent'};
      } catch (error) {output.local = {status:'failed',reason:error.message};}
    }
    const remaining = inventory(repo).refs;
    return {results,remaining,complete:remaining.length === 0 && results.every(item => item.remote.status === 'cleaned' && item.local.status === 'cleaned')};
  });
}

export async function runArchiveTags(command, values) {
  const repo = repository(values.repo);
  if (command === "archive-tags-list") {
    const output = inventory(repo);
    writeFileSync(values.manifest, JSON.stringify(output, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return { output };
  }

  const manifest = JSON.parse(readFileSync(values.manifest, "utf8"));
  const output = await retire(repo, manifest, values["service-ready"]);
  return { output, exitCode: output.complete ? 0 : 2 };
}
