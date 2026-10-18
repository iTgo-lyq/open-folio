import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";

const script = resolve(
  ".agents/skills/spec-trail/setup/scripts/preview-routing.mjs",
);
const at = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const stamp = "2026-10-18T00:00:00.000Z";
const state = (
  id: string,
  branch: string,
  status = "active",
  stage = "requirement",
) => ({
  schemaVersion: 1,
  id,
  title: id,
  branch,
  size: "small",
  status,
  stage,
  confirmations: {},
  tasks: {},
  closure: {},
  ...(status === "cancelled"
    ? { cancellation: { at: stamp, reason: "Cancelled" } }
    : {}),
});
const archive = (id: string) => ({
  ...state(id, `change/${id}`, "completed", "close"),
  closure: {
    verification: { result: "passed", at: stamp, summary: "Verified" },
    acceptance: { result: "accepted", at: stamp, summary: "Accepted" },
    specs: { result: "synced", at: stamp, summary: "Synced" },
    archive: {
      result: "done",
      at: stamp,
      summary: "Archived",
      path: `docs/project/archive/2026-10-18-${id}`,
    },
  },
});
function fixture(
  t: import("node:test").TestContext,
  collaborationBranch = "develop",
) {
  const root = mkdtempSync(join(tmpdir(), "folio-migration-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  at(root, "init", "-b", collaborationBranch);
  at(root, "config", "user.name", "Migration test");
  at(root, "config", "user.email", "migration@example.invalid");
  const put = (path: string, value: unknown) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const record = (id: string, value: unknown, archived = false) =>
    put(
      `docs/project/${archived ? `archive/2026-10-18-${id}` : `changes/${id}`}/change.json`,
      value,
    );
  const commit = () => {
    at(root, "add", ".");
    at(root, "commit", "-m", "Fixture");
  };
  put("docs/project/workflow.json", {
    schemaVersion: 2,
    collaborationBranch,
    protectedBranches: ["main"],
  });
  commit();
  const preview = (branches: string[] = [], expected = 0) => {
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--repo",
        root,
        ...branches.flatMap((b) => ["--work-branch", b]),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, expected, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  return { root, put, record, commit, preview };
}

test("current workflow routing preview is repeatable, preserves metadata and limits discovery to known sources", (t) => {
  const f = fixture(t);
  f.record("plan", state("plan", "develop"));
  f.record("done", archive("done"), true);
  f.commit();
  at(f.root, "switch", "-c", "change/run");
  const run = {
    ...state("run", "change/run", "active", "execution"),
    previews: [
      {
        id: "screen",
        title: "Fixed screen",
        artifact: {
          type: "git",
          path: "dist/screen/index.html",
          sourceCommit: "a".repeat(40),
        },
        kind: "page",
        devices: ["pc-web"],
      },
    ],
  };
  f.record("run", run);
  f.commit();
  const source = at(f.root, "rev-parse", "HEAD");
  at(f.root, "switch", "-c", "change/cancel", "develop");
  f.record("cancel", state("cancel", "change/cancel", "cancelled"));
  f.commit();
  at(f.root, "switch", "-c", "change/unknown", "develop");
  f.record("unknown", state("unknown", "change/unknown"));
  f.commit();
  at(f.root, "switch", "develop");
  f.put("uncommitted.txt", "Preserve my work");
  at(f.root, "add", "uncommitted.txt");
  const refs = at(f.root, "show-ref"),
    index = readFileSync(join(f.root, ".git/index"));
  const output = f.preview(["change/run", "change/cancel"]);
  assert.deepEqual(output, f.preview(["change/run", "change/cancel"]));
  assert.deepEqual(output.errors, []);
  assert.deepEqual(
    output.proposals.map((p: { id: string; action: string }) => [
      p.id,
      p.action,
    ]),
    [
      ["cancel", "register-owner"],
      ["done", "keep-archive"],
      ["plan", "keep-planning"],
      ["run", "register-owner"],
    ],
  );
  assert.equal(
    output.proposals.find((p: { id: string }) => p.id === "run").sourceCommit,
    source,
  );
  assert.match(output.coverage.note, /unknown remote work was not discovered/);
  assert.deepEqual(
    JSON.parse(
      at(f.root, "show", `${source}:docs/project/changes/run/change.json`),
    ),
    run,
  );
  assert.equal(at(f.root, "show-ref"), refs);
  assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
  assert.equal(
    readFileSync(join(f.root, "uncommitted.txt"), "utf8"),
    "Preserve my work",
  );
});

test("migration refuses missing owners, baseline implementation and completed deliveries not yet integrated", (t) => {
  const f = fixture(t);
  f.record("missing", state("missing", "change/missing"));
  f.record("running", state("running", "develop", "active", "execution"));
  f.commit();
  at(f.root, "switch", "-c", "change/unmerged");
  f.record("unmerged", archive("unmerged"), true);
  f.commit();
  at(f.root, "switch", "develop");
  const output = f.preview(["change/unmerged"], 1);
  assert.match(output.errors.join("\n"), /Known branch change\/missing/);
  assert.match(output.errors.join("\n"), /independent work branch/);
  assert.match(output.errors.join("\n"), /Integrate the completed delivery/);
});

test("migration reports duplicate claims, historical conflicts and malformed known records", (t) => {
  const f = fixture(t);
  f.record("done", archive("done"), true);
  f.commit();
  at(f.root, "switch", "-c", "change/one");
  f.record("same", state("same", "change/one"));
  f.record("done", state("done", "change/one"));
  f.record("broken", "{ broken");
  f.commit();
  at(f.root, "switch", "-c", "change/two", "develop");
  f.record("same", state("same", "change/two"));
  f.commit();
  at(f.root, "switch", "develop");
  const output = f.preview(["change/one", "change/two"], 1);
  assert.match(output.errors.join("\n"), /Multiple known/);
  assert.match(output.errors.join("\n"), /historical id conflicts/);
  assert.match(output.errors.join("\n"), /Cannot read.*broken/);
});

test("migration reports registered worktrees and divergent tracking refs without changing either", (t) => {
  const f = fixture(t),
    work = `${f.root}-work`;
  at(f.root, "branch", "change/work");
  at(f.root, "worktree", "add", work, "change/work");
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const before = at(f.root, "rev-parse", "develop");
  at(f.root, "update-ref", "refs/remotes/origin/develop", before);
  f.record("new", state("new", "develop"));
  f.commit();
  const result = f.preview([], 1);
  assert(result.coverage.worktreeBranches.includes("change/work"));
  assert.match(result.errors.join("\n"), /local\/tracking differences/);
  assert.equal(at(f.root, "rev-parse", "refs/remotes/origin/develop"), before);
});

test("migration rejects independent baseline ownership and completed records left in live directories", (t) => {
  const f = fixture(t);
  f.record("conflict", state("conflict", "develop"));
  f.record("completed-live", archive("completed-live"));
  f.record("registered", state("registered", "change/work"));
  f.commit();
  at(f.root, "switch", "-c", "change/work");
  f.record("conflict", state("conflict", "change/work", "active", "execution"));
  f.record(
    "registered",
    state("registered", "change/work", "active", "execution"),
  );
  f.commit();
  at(f.root, "switch", "develop");
  const output = f.preview(["change/work"], 1);
  assert.equal(
    output.proposals.find((p: { id: string }) => p.id === "registered").action,
    "register-owner",
  );
  assert.match(output.errors.join("\n"), /Baseline ownership conflicts/);
  assert.match(
    output.errors.join("\n"),
    /Completed record must be in its closed archive/,
  );
});

test("routing preview rejects legacy workflow without modifying refs, index or source bytes", (t) => {
  const f = fixture(t);
  f.put("docs/project/workflow.json", {
    schemaVersion: 1,
    protectedBranches: ["main"],
  });
  const config = readFileSync(join(f.root, "docs/project/workflow.json")),
    refs = at(f.root, "show-ref"),
    index = readFileSync(join(f.root, ".git/index"));
  const result = spawnSync(process.execPath, [script, "--repo", f.root], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Invalid workflow.json.*(?:version 2|schemaVersion)/,
  );
  assert.equal(result.stdout, "");
  assert.equal(at(f.root, "show-ref"), refs);
  assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
  assert.deepEqual(
    readFileSync(join(f.root, "docs/project/workflow.json")),
    config,
  );
});

test("routing preview defaults to the configured custom collaboration branch", (t) => {
  const branch = "team/planning",
    f = fixture(t, branch);
  f.record("plan", state("plan", branch));
  f.commit();
  const result = f.preview();
  assert.equal(result.baseline, branch);
  assert.equal(result.collaborationBranch, branch);
  assert.deepEqual(
    result.sources.map((source: { branch: string }) => source.branch),
    [branch],
  );
  assert.deepEqual(
    result.proposals.map(
      (entry: { id: string; action: string; branch: string }) => [
        entry.id,
        entry.action,
        entry.branch,
      ],
    ),
    [["plan", "keep-planning", branch]],
  );
});
