// Shared lifecycle of state commands: locate a Change, open it under the state
// lock, let the command change `ctx.state`, check invariants and write it back.
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { define } from "../define.mjs";
import { withStateLock } from "../core/lock.mjs";
import { closedRecord } from "../core/routing.mjs";
import { changeIntegration } from "../core/github-prs.mjs";
import { validateChange, validateWorkflow } from "../core/state-schema.mjs";
import { collaborationCatalog, deliveryTarget, repository, routedRecord } from "../core/repository.mjs";

export const assert = (value, message) => {
  if (!value) throw Error(message);
};
export const json = (value) => JSON.stringify(value, null, 2) + "\n";
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const list = (value) => (value ? value.split(",") : []);
export const changeIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const stages = ["requirement", "technical", "plan", "execution", "close"];
export const stateNotes = [
  "Plan on the integration branch; after handoff, run on the registered work branch.",
  "Commands change only local files in docs/project/ and never commit or push.",
];

/** Resolve the repository, collaboration catalog and local records of a Change without locking. */
export function locate(opts, { refresh }) {
  const need = (key) => {
    assert(typeof opts[key] === "string" && opts[key].trim(), `--${key} is required`);
    return opts[key];
  };
  const id = need("change");
  assert(changeIdPattern.test(id), "Invalid Change id");
  const cwd = resolve(opts.repo || ".");
  const git = (args) =>
    execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  const root = git(["rev-parse", "--show-toplevel"]);
  // Reject symlinks in every component, not only the final JSON file.
  const safe = (path) => {
    const absolute = resolve(root, path),
      rel = relative(root, absolute);
    assert(rel && !rel.startsWith("..") && !isAbsolute(rel), "Path must stay inside the repository");
    let at = root;
    for (const part of rel.split("/")) {
      at = join(at, part);
      try {
        assert(!lstatSync(at).isSymbolicLink(), `Symlinks are not supported: ${relative(root, at)}`);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    return absolute;
  };
  const records = () =>
    ["changes", "archive"].flatMap((kind) => {
      const dir = safe(`docs/project/${kind}`);
      if (!existsSync(dir)) return [];
      return readdirSync(dir).flatMap((name) => {
        const file = safe(`docs/project/${kind}/${name}/change.json`);
        if (!existsSync(file)) return [];
        let state;
        try {
          state = readJson(file);
        } catch {
          state = { id: kind === "archive" ? name.slice(11) : name };
        }
        return [{ file, state, archived: kind === "archive" }];
      });
    });
  safe("docs/project/workflow.json");
  const repo = repository(root);
  const catalog = collaborationCatalog(repo, { refresh, local: repo.branch === repo.config.integrationBranch });
  const route = catalog?.routes.find((entry) => entry.id === id);
  if (route?.kind === "target" && !["delete", "mark"].includes(opts.mode))
    routedRecord(repo, catalog, id, { refresh });
  return {
    opts, need, id, cwd, git, root, safe, records, repo, catalog, route,
    matches: records().filter((r) => r.state.id === id),
    liveDir: safe(`docs/project/changes/${id}`),
  };
}

/**
 * A command that changes one Change record. `run(ctx)` edits `ctx.state`;
 * `initial(ctx)` creates a new record instead of opening one; `restore` lets
 * the command reopen an archive that is not integrated; `after(ctx)` runs
 * once the invariants hold.
 */
export function stateCommand(summary, { run, initial, restore = false, collaboration = false, after, dryRun = true, required = [], optional = [], help, notes, example = "" }) {
  return define(
    (opts, name) => runState({ name, run, initial, restore, collaboration, after }, opts),
    {
      summary,
      required: ["change", ...required],
      optional: [...optional, "repo"],
      booleans: dryRun ? ["dry-run"] : [],
      help,
      notes,
      example: `--change example${example}`,
    },
  );
}

async function runState(spec, opts) {
  const ctx = locate(opts, { refresh: !opts["dry-run"] });
  assert(ctx.matches.length <= 1, "Duplicate Change id; resolve the source records first");
  return withStateLock(ctx.repo.common, ctx.root, async () => {
    ctx.name = spec.name;
    await open(ctx, spec);
    await spec.run(ctx);
    checkInvariants(ctx);
    await spec.after?.(ctx);
    return { output: write(ctx) };
  });
}

async function open(ctx, spec) {
  const { id, git, root, safe, repo, catalog, route, liveDir } = ctx;
  const creating = !!spec.initial;
  const branch = git(["symbolic-ref", "--short", "HEAD"]);
  const config = readJson(safe("docs/project/workflow.json"));
  const central = spec.collaboration && ["mark", "delete"].includes(ctx.opts.mode);
  assert(!central || branch === config.integrationBranch, "Use the collaboration branch for this cancellation step");
  assert(!validateWorkflow(config).length, "Invalid workflow.json");
  assert(config.releaseBranch !== branch, "Use the Change branch, not a protected branch");
  const all = ctx.records();
  assert(branch === repo.branch, "The checkout branch changed; retry after inspecting the workspace");
  if (route) {
    assert(!route.errors.length, route.errors.join("; "));
    assert(
      (central || route.branch === branch) && route.kind !== "archive",
      `Use the registered Change branch ${route.branch}; inherited entries are read-only`,
    );
  } else assert(branch === config.integrationBranch, "Register this Change on the collaboration branch before writing it");
  if (creating) {
    assert(branch === config.integrationBranch, "Create planning Changes on the collaboration branch");
    assert(!route, "Change id is already registered on the collaboration branch");
  }
  assert(
    branch === config.integrationBranch ||
      !all.some((r) => r.state.branch === branch && r.state.status === "cancelled"),
    "This branch contains a cancelled Change and is frozen",
  );
  const found = all.filter((r) => r.state.id === id);
  assert(found.length <= 1, "Duplicate Change id");
  const restoring = spec.restore && found[0]?.archived;
  if (creating) assert(!found.length && !existsSync(liveDir), "Change already exists; create never overwrites");
  else assert(found.length === 1 && (!found[0].archived || restoring), "Change not found or archived; archive is read-only");
  const file = creating ? join(liveDir, "change.json") : found[0].file;
  assert(creating || restoring || file === join(liveDir, "change.json"), "Change directory does not match its id");
  const original = creating ? null : readFileSync(file, "utf8");
  Object.assign(ctx, { branch, config, all, restoring, file, original, now: new Date().toISOString(), availability: [], archiveCopies: [] });
  const state = (ctx.state = creating ? spec.initial(ctx) : JSON.parse(original));
  assert(!validateChange(state).length, `Invalid input Change: ${validateChange(state).join("; ")}`);
  assert(
    central || state.branch === branch || (route?.kind === "planning" && route.branch === branch && state.branch === route.ownerBranch),
    `Switch to the Change branch ${state.branch}`,
  );
  if (restoring) {
    assert(!existsSync(liveDir), "The active Change directory already exists");
    assert(closedRecord(state, relative(root, dirname(file))), "Only valid completed archives can be restored");
    assert(!catalog.routes.some((entry) => entry.id === id && entry.kind === "archive"), "Integrated archives are read-only");
    const delivered = routedRecord(repo, catalog, id, { refresh: true });
    assert(!delivered.archived || delivered.branch === state.branch, "Integrated archives are read-only");
    const target = deliveryTarget(repo, catalog, state, { refresh: true });
    let included = false;
    try {
      git(["merge-base", "--is-ancestor", "HEAD", target.commit]);
      included = true;
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    assert(!included, "Source commits are already included in the integration branch");
    const integration = await changeIntegration(repo, catalog, id, state.branch);
    assert(integration.status === "missing", "Integrated or unverifiable PR deliveries are read-only");
  } else assert(state.status === "active", "Only active Changes can be modified");
  ctx.recordDir = restoring ? dirname(file) : liveDir;
}

/** Rules every written Change must satisfy, whatever the command. */
export function checkInvariants({ id, state, branch, config }) {
  const errors = validateChange(state);
  assert(!errors.length, errors.join("; "));
  assert(
    branch !== config.integrationBranch || state.status === "cancelled" || state.size === "xlarge" || !["execution", "close"].includes(state.stage),
    "Handoff this Change to its own worktree before implementation",
  );
  assert(
    !(state.dependsOn || []).includes(id) && !(state.children || []).includes(id) && state.parent !== id,
    "A Change cannot depend on, parent or contain itself",
  );
  if (state.size === "xlarge")
    assert(
      !Object.keys(state.tasks).length && !state.dependsOn?.length && state.children?.length,
      "xlarge requires children, no tasks or dependsOn",
    );
  else assert(!state.children?.length, "Only xlarge can have children");
}

export function archiveDestination({ safe, id }, date) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
      new Date(`${date}T00:00:00Z`).toISOString().startsWith(date),
    "Use a valid YYYY-MM-DD date in the user timezone",
  );
  const directory = safe(`docs/project/archive/${date}-${id}`);
  assert(!existsSync(directory), "Archive destination already exists");
  return directory;
}

// Write the new state atomically through a temporary file. Archive and restore
// move the whole directory; a task retry also repairs the staged copy.
function write(ctx) {
  const { opts, name, git, cwd, root, safe, file, original, state, liveDir, restoring, archiveDir, archiveCopies, indexRecovery, availability } = ctx;
  const result = {
    command: name,
    dryRun: opts["dry-run"],
    path: relative(root, archiveDir ? join(archiveDir, "change.json") : restoring ? join(liveDir, "change.json") : file),
    ...(ctx.deleteChange ? { deleted: true } : { state }),
    ...(availability.length ? { availability } : {}),
  };
  if (opts["dry-run"]) return result;
  assert(
    original === null ? !existsSync(file) : readFileSync(file, "utf8") === original,
    "Change changed concurrently; retry after inspecting",
  );
  if (ctx.deleteChange) {
    assert(git(["symbolic-ref", "--short", "HEAD"]) === ctx.branch, "Branch changed during the operation");
    git(["rm", "-r", "--", relative(root, liveDir)]);
    result.next = "Commit and push the deleted collaboration entry.";
    return result;
  }
  if (original === null) mkdirSync(liveDir, { recursive: true });
  const temporary = join(dirname(file), `.change-${randomUUID()}.tmp`);
  const copiedFiles = [],
    createdDirectories = [];
  const makeDirectory = (path) => {
    if (existsSync(path)) return;
    makeDirectory(dirname(path));
    mkdirSync(path);
    createdDirectories.push(path);
  };
  let updatedBlob;
  try {
    writeFileSync(temporary, json(state), {
      flag: "wx",
      mode: original === null ? 0o644 : lstatSync(file).mode & 0o777,
    });
    assert(git(["symbolic-ref", "--short", "HEAD"]) === ctx.branch, "Branch changed during the operation");
    if (indexRecovery) {
      assert(
        git(["ls-files", "--stage", "--", relative(root, file)]) === indexRecovery.indexed,
        "Index changed during task recovery",
      );
      const blob = execFileSync("git", ["-C", cwd, "hash-object", "-w", "--stdin"], {
        input: indexRecovery.content,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      git(["update-index", "--cacheinfo", indexRecovery.mode, blob, relative(root, file)]);
      updatedBlob = blob;
    }
    if (archiveDir) {
      for (const { target, content } of archiveCopies) {
        safe(target);
        makeDirectory(dirname(target));
        const descriptor = openSync(target, "wx");
        copiedFiles.push(target);
        try {
          writeFileSync(descriptor, content);
        } finally {
          closeSync(descriptor);
        }
      }
      mkdirSync(safe("docs/project/archive"), { recursive: true });
      renameSync(liveDir, archiveDir);
      try {
        renameSync(join(archiveDir, relative(liveDir, temporary)), join(archiveDir, "change.json"));
      } catch (error) {
        renameSync(archiveDir, liveDir);
        throw error;
      }
    } else if (restoring) {
      mkdirSync(dirname(liveDir), { recursive: true });
      renameSync(dirname(file), liveDir);
      try {
        renameSync(join(liveDir, relative(dirname(file), temporary)), join(liveDir, "change.json"));
      } catch (error) {
        renameSync(liveDir, dirname(file));
        throw error;
      }
    } else renameSync(temporary, file);
  } catch (error) {
    for (const path of copiedFiles.reverse()) rmSync(path, { force: true });
    for (const path of createdDirectories.reverse()) rmdirSync(path);
    if (updatedBlob && git(["rev-parse", `:${relative(root, file)}`]) === updatedBlob)
      git(["update-index", "--cacheinfo", indexRecovery.mode, indexRecovery.blob, relative(root, file)]);
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
  result.next = archiveDir && state.status === "cancelled"
    ? ctx.branch === ctx.config.integrationBranch
      ? "Commit and push the cancelled archive on the collaboration branch."
      : "Commit and push the cancelled archive, then use change cancel --mode mark on the collaboration branch."
    : archiveDir
    ? `Commit and push the archived source, then run node .agents/skills/spec-trail/cli.mjs integration preflight --change ${state.id}; create/reuse its PR and verify the remote merge before cleanup. Use stage rework for corrections before integration.`
    : "Review the local diff, commit and push. A local command is not a published workflow fact.";
  return result;
}
