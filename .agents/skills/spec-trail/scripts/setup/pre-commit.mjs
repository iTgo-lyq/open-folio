// SpecTrail staged validation. Node.js built-ins only.

import { execFileSync } from "node:child_process";
import { validateChange, validateWorkflow } from "../core/state-schema.mjs";
import { stagedPrototypeIssues } from "../prototype/hooks.mjs";
import { changeLocation, sourceOwnership, planningRecord } from "../core/routing.mjs";
import { externalScriptDependencies } from "./script-dependencies.mjs";

export function runPreCommit({ repo = "." }) {
  // Inherit Git's environment, including GIT_INDEX_FILE for partial commits.
  const gitAt = (cwd, args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  const root = gitAt(repo, ["rev-parse", "--show-toplevel"]).trim();
  const git = args => gitAt(root, args);
  const paths = git([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMT",
    "--no-renames",
    "-z",
    "--",
    "docs/project/",
  ])
    .split("\0")
    .filter(Boolean);
  const allChanged=git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
  let count = 0;
  let failed = false;
  const scripts = git([
    "diff", "--cached", "--name-only", "--diff-filter=ACMT", "--no-renames",
    "-z", "--", ".agents/skills/spec-trail/",
  ]).split("\0").filter((path) => /\.[cm]?js$/.test(path));
  for (const path of scripts) {
    let dependencies;
    try {
      dependencies = externalScriptDependencies(git(["show", `:${path}`]));
    } catch (error) {
      console.error(`${path}: cannot check staged script dependencies: ${error.message}`);
      failed = true;
      continue;
    }
    for (const specifier of dependencies) {
      console.error(`${path}: use a relative path or node: built-in instead of ${JSON.stringify(specifier)}`);
      failed = true;
    }
  }
  for (const path of paths) {
    const validate =
      path === "docs/project/workflow.json"
        ? validateWorkflow
        : /^docs\/project\/(changes|archive)\/[^/]+\/change\.json$/.test(path)
          ? validateChange
          : undefined;
    if (!validate) continue;
    count++;
    const errors = [];
    let value;
    try {
      value = JSON.parse(git(["show", `:${path}`]));
    } catch {
      errors.push("/: cannot read valid JSON from the index");
    }
    if (!errors.length) errors.push(...validate(value));
    for (const error of errors) console.error(`${path}: ${error}`);
    failed ||= errors.length > 0;
  }
  // Cross-file checks always use the index, including GIT_INDEX_FILE for partial commits.
  const rows = git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean);
  const indexed = new Map(
    rows.map((row) => {
      const tab = row.indexOf("\t");
      return [row.slice(tab + 1), row.slice(0, tab).split(" ")];
    }),
  );
  const readState = (ref) => {
    try {
      return JSON.parse(git(["show", ref]));
    } catch {
      return null;
    }
  };
  const workflow = readState(":docs/project/workflow.json");
  let branch;
  try {
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
  } catch {}
  const committedWorkflow =
    readState("HEAD:docs/project/workflow.json") ?? workflow;
  let merging = false;
  try {
    git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    merging = true;
  } catch {}
  if (branch === committedWorkflow?.integrationBranch && !merging) {
    const changedIds = new Set(
      git([
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "-z",
        "--",
        "docs/project/changes/",
      ])
        .split("\0")
        .map((path) => /^docs\/project\/changes\/([^/]+)\//.exec(path)?.[1])
        .filter(Boolean),
    );
    for (const id of changedIds) {
      const path = `docs/project/changes/${id}/change.json`;
      // Central copies keep their planning stage after handoff. Read ownership
      // before this commit, including when it deletes or rewrites change.json.
      const owner = readState(`HEAD:${path}`);
      if (
        owner?.status !== "active" ||
        typeof owner.branch !== "string" ||
        !owner.branch ||
        owner.branch === branch ||
        owner.branch === committedWorkflow.releaseBranch
      )
        continue;
      const ownership = [];
      for (const ref of [`refs/heads/${owner.branch}`, `refs/remotes/origin/${owner.branch}`]) {
        try { git(['rev-parse', '--verify', `${ref}^{commit}`]); } catch { continue; }
        const records = git(['ls-tree', '-rz', '--full-tree', ref, '--',
          `docs/project/changes/${id}/`, 'docs/project/archive/'])
          .split('\0').flatMap(row => {
            const file = row.slice(row.indexOf('\t') + 1), location = changeLocation(file);
            if (location?.id !== id) return [];
            const state = readState(`${ref}:${file}`);
            return [{...location, state, ...(!state ? {error: 'Invalid source JSON'} : {})}];
          });
        ownership.push(sourceOwnership(records, id, owner.branch));
      }
      if (planningRecord(owner) && !ownership.some(value => value !== 'unclaimed')) continue;
      if (ownership.includes('invalid')) {
        console.error(`${path}: Cannot verify the Change source on ${owner.branch}; inspect its invalid records before committing.`);
        failed = true;
        continue;
      }
      let location;
      let worktree;
      for (const field of git(["worktree", "list", "--porcelain", "-z"]).split(
        "\0",
      )) {
        if (field.startsWith("worktree ")) worktree = field.slice(9);
        if (field === `branch refs/heads/${owner.branch}`) location = worktree;
      }
      console.error(
        `${path}: Change ${id} was handed off to ${owner.branch}; ` +
          `cannot commit its documents on integration branch ${branch}. ` +
          (location
            ? `Continue in worktree ${location}.`
            : `Locate its worktree with node .agents/skills/spec-trail/cli.mjs workspace locate --change ${id}.`),
      );
      failed = true;
    }
  }
  const prototypeIssues = stagedPrototypeIssues({
    git, root, indexed, changedStateFiles: paths, allChanged, workflow, committedWorkflow, branch, readState,
  });
  for (const issue of prototypeIssues) console.error(issue);
  failed ||= prototypeIssues.length > 0;
  if (failed) {
    console.error(
      "SpecTrail: fix the reported state files and stage the corrections before committing.",
    );
  }
  return { output: { valid: !failed, checkedStateFiles: count }, exitCode: failed ? 1 : 0 };
}
