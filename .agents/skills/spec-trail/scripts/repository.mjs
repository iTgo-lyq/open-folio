import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateChange, validateWorkflow } from "./state-schema.mjs";
import { changeLocation, routeCatalog, validBranchName, parentBranch, parentArchive, sourceOwnership, resolvePlanningRoute, planningRecord } from "./routing.mjs";

export function repository(cwd = ".") {
  const git = (args) =>
    execFileSync("git", ["-C", resolve(cwd), "--literal-pathspecs", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trimEnd();
  const root = git(["rev-parse", "--show-toplevel"]);
  const config = JSON.parse(
    readFileSync(join(root, "docs/project/workflow.json"), "utf8"),
  );
  const issues = validateWorkflow(config);
  if (issues.length) throw Error(`Invalid workflow.json: ${issues.join("; ")}`);
  let branch = null;
  try {
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {}
  return {
    root,
    config,
    branch,
    git,
    common: git(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  };
}

export function revision(repo, ref) {
  try {
    return repo.git(["rev-parse", "--verify", `${ref}^{commit}`]);
  } catch {
    return null;
  }
}

export function remoteBranch(repo, branch) {
  if (!validBranchName(branch)) throw Error("Invalid branch name");
  const ref = `refs/heads/${branch}`;
  const rows = repo.git(["ls-remote", "origin", ref]).split("\n");
  return (
    rows
      .map((row) => row.split("\t"))
      .find(
        ([sha, name]) => /^[a-f0-9]{40,64}$/.test(sha) && name === ref,
      )?.[0] ?? null
  );
}

export function fetchBranch(repo, branch) {
  const advertised = remoteBranch(repo, branch);
  if (!advertised) throw Error(`Remote branch is missing: ${branch}`);
  const ref = `refs/remotes/origin/${branch}`;
  if (revision(repo, ref) !== advertised)
    repo.git([
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      "origin",
      `+refs/heads/${branch}:${ref}`,
    ]);
  return revision(repo, ref);
}

export function recordsAt(repo, ref, id) {
  const rows = repo
    .git([
      "ls-tree",
      "-rz",
      "--full-tree",
      ref,
      "--",
      "docs/project/changes/",
      "docs/project/archive/",
    ])
    .split("\0");
  return rows.flatMap((row) => {
    const tab = row.indexOf("\t");
    if (tab < 0) return [];
    const path = row.slice(tab + 1),
      location = changeLocation(path);
    if (!location || (id && location.id !== id)) return [];
    const [mode, kind, blob] = row.slice(0, tab).split(" ");
    let state = null,
      error;
    try {
      if (kind !== "blob" || !["100644", "100755"].includes(mode))
        throw Error("Change record must be a regular Git file");
      state = JSON.parse(repo.git(["cat-file", "blob", blob]));
    } catch (e) {
      error = `Cannot read ${path}: ${e.message}`;
    }
    return [{ ...location, path, state, ...(error ? { error } : {}) }];
  });
}

export function collaborationCatalog(
  repo,
  { refresh = false, local = false } = {},
) {
  const name = repo.config.integrationBranch;
  if (repo.config.schemaVersion !== 3 || !validBranchName(name))
    throw Error("Complete SpecTrail Setup before using collaboration routing");
  if (refresh) fetchBranch(repo, name);
  let ref = `refs/remotes/origin/${name}`,
    commit = revision(repo, ref);
  if (!commit && local) {
    ref = `refs/heads/${name}`;
    commit = revision(repo, ref);
  }
  if (!commit)
    throw Error(`Fetch the configured collaboration branch ${name} first`);
  const config = JSON.parse(
    repo.git(["show", `${commit}:docs/project/workflow.json`]),
  );
  if (
    validateWorkflow(config).length ||
    config.integrationBranch !== name
  )
    throw Error(
      "The collaboration configuration is invalid or disagrees with this checkout; complete Setup first",
    );
  const entries = recordsAt(repo, commit);
  return {
    branch: name,
    ref,
    commit,
    config,
    entries,
    routes: routeCatalog(entries, name, config.releaseBranch),
    freshness: ref.startsWith("refs/heads/")
      ? "local-only"
      : refresh
        ? "remote-checked"
        : "cached-tracking-ref",
  };
}

export function routedRecord(repo, catalog, id, { refresh = false } = {}) {
  const route = catalog.routes.find((entry) => entry.id === id);
  if (!route)
    throw Error(`Change ${id} is not registered on ${catalog.branch}`);
  if (route.errors.length) throw Error(`${id}: ${route.errors.join("; ")}`);
  const centralEntry = catalog.entries.find(row => row.id === id);
  let unstartedChild = false;
  if (route.kind === 'target' && route.parent) {
    const parentEntry = catalog.entries.find(row => row.id === route.parent);
    if (!parentEntry || parentEntry.state?.parent)
      throw Error(`Child ${id}: parent is missing or nested`);
    const parent = routedRecord(repo, catalog, route.parent, {refresh});
    if (parent.errors.length) throw Error(parent.errors.join('; '));
    unstartedChild = !parent.archived && parent.branch === catalog.branch &&
      planningRecord(parent.state) && planningRecord(centralEntry?.state);
  }
  if (route.kind === 'target' && route.parent && !unstartedChild) {
    const entry = catalog.entries.find(row => row.id === id);
    const target = deliveryTarget(repo, catalog, entry.state, {refresh});
    const record = parentArchive(recordsAt(repo, target.commit, id), entry.state, target.parent);
    if (record) return {...record, branch: target.readBranch, commit: target.commit,
      sourceRef: target.ref, entryPath: route.entryPath, entryCommit: catalog.commit,
      errors: validateChange(record.state), freshness: catalog.freshness};
  }
  if (route.kind === 'target') {
    const declared = route.branch;
    const local = revision(repo, `refs/heads/${declared}`);
    const tracking = revision(repo, `refs/remotes/origin/${declared}`);
    const localOwnership = sourceOwnership(local ? recordsAt(repo, local, id) : [], id, declared);
    const knownOwnership = sourceOwnership(tracking ? recordsAt(repo, tracking, id) : [], id, declared);
    let ownership = localOwnership === 'owned' || knownOwnership === 'owned' ? 'owned' :
      localOwnership === 'invalid' || knownOwnership === 'invalid' ? 'invalid' : 'unclaimed';
    if (refresh) {
      const advertised = remoteBranch(repo, declared);
      if (advertised) {
        const commit = fetchBranch(repo, declared);
        ownership = sourceOwnership(recordsAt(repo, commit, id), id, declared);
        if (ownership === 'unclaimed' && localOwnership !== 'unclaimed') ownership = localOwnership;
      } else if (ownership !== 'unclaimed') {
        throw Error(`Remote branch is missing: ${declared}; preserve the known source instead of using its central copy`);
      }
    }
    if (ownership === 'invalid') throw Error(`Invalid Change source on ${declared}; inspect it before continuing`);
    const entry = catalog.entries.find(row => row.id === id);
    Object.assign(route, resolvePlanningRoute(route, entry?.state, ownership, catalog.branch));
  } else if (refresh && route.branch !== catalog.branch) fetchBranch(repo, route.branch);
  const ref =
    route.branch === catalog.branch
      ? catalog.ref
      : revision(repo, `refs/remotes/origin/${route.branch}`)
        ? `refs/remotes/origin/${route.branch}` : `refs/heads/${route.branch}`;
  const commit =
    route.branch === catalog.branch ? catalog.commit : revision(repo, ref);
  if (!commit)
    throw Error(
      `Fetch the registered branch ${route.branch} first; no fallback to the collaboration copy`,
    );
  const records = recordsAt(repo, commit, id);
  if (records.length !== 1)
    throw Error(
      `Expected one live/archive record for ${id} on ${route.branch}, found ${records.length}`,
    );
  const record = records[0];
  if (record.error) throw Error(record.error);
  if (
    record.state?.id !== id ||
    (route.kind !== "archive" && record.state?.branch !== route.branch &&
      !(route.kind === 'planning' && record.state?.branch === route.ownerBranch))
  )
    throw Error(
      `The target record for ${id} does not match its registered identity/branch`,
    );
  return {
    ...record,
    branch: route.branch,
    commit,
    sourceRef: ref,
    entryPath: route.entryPath,
    entryCommit: catalog.commit,
    errors: validateChange(record.state),
    freshness: refresh ? "remote-checked" : catalog.freshness,
  };
}

/** The PR base remains the historical parent branch after its ref is deleted. */
export function deliveryTarget(repo, catalog, state, {refresh = false} = {}) {
  if (!state.parent) return {branch: catalog.branch, readBranch: catalog.branch,
    commit: catalog.commit, ref: catalog.ref};
  const parentEntry = catalog.entries.find(row => row.id === state.parent);
  if (!parentEntry || parentEntry.state?.parent)
    throw Error(`Child ${state.id}: parent is missing or nested`);
  const record = routedRecord(repo, catalog, state.parent, {refresh});
  if (record.errors.length) throw Error(record.errors.join('; '));
  if (!record.archived && record.branch === catalog.branch)
    throw Error(`Child ${state.id}: parent has not actually been handed off`);
  const branch = parentBranch(state, record.state, catalog.branch, catalog.config.releaseBranch);
  return {branch, readBranch: record.branch, commit: record.commit, ref: record.sourceRef, parent: record.state};
}
