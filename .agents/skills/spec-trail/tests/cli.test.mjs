import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

function outsideProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "spec-trail-cli-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return args => spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("CLI help and argument errors work outside a Git project", async t => {
  const run = outsideProject(t);
  const { groups } = await import("../scripts/commands.mjs");
  const overview = run(["--help"]).stdout;
  const listed = overview.split("\n").filter(line => /^  \S/.test(line)).map(line => line.trim().split(/\s+/)[0]);
  assert.deepEqual(listed, ["change", "clarify", "task", "stage", "close", "workspace", "integration", "share"]);
  for (const group of Object.keys(groups)) assert.equal(run([group, "--help"]).status, 0, group);

  for (const [args, expected] of [
    [["task", "--help"], /^  start +Move a task from todo or blocked to doing /m],
    [["task", "start", "--help"], /--task <Tn> +\(required\) Task id such as T1/],
    [["task", "start", "--help"], /^Usage: .* task start --change <id> --task <Tn> \[--repo <path>\] \[--dry-run\]$/m],
    [["setup", "--help"], /^  check +Read-only readiness check/m],
    [["prototype", "previews", "--help"], /--file <file> +\(required\)/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
  }

  for (const [args, expected] of [
    [[""], /Unknown command group/],
    [["toString"], /Unknown command group/],
    [["change", ""], /Unknown command/],
    [["change", "constructor"], /Unknown command/],
    [["change", "show", "--typo"], /Unknown option/],
    [["change", "show", "--change", "example", "extra"], /Unexpected argument/],
    [["task", "start", "--change", "example"], /--task is required/],
    [["close", "verify", "--change", "example", "--result", "maybe", "--summary", "done"], /--result must be one of: passed, failed/],
    [["prototype", "configure", "--hosting", "s3"], /--hosting must be one of: openfolio, custom, git/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Usage:/);
  }
});

test("prototype accept waits for the project's build, then pages publish", {
  skip: Number(process.versions.node.split(".")[0]) < 24,
}, t => {
  const cwd = mkdtempSync(join(tmpdir(), "spec-trail-prototype-cli-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, stdio: "pipe" });
  git("init", "-b", "develop");
  mkdirSync(join(cwd, "docs/project"), { recursive: true });
  writeFileSync(join(cwd, "docs/project/workflow.json"), JSON.stringify({
    schemaVersion: 3,
    integrationBranch: "develop",
    releaseBranch: "main",
  }));
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Initialize");

  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, "prototype", ...args], { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const pkg = join(cwd, "packages/prototype");
  assert.equal(run("accept", "--hosting", "custom").status, "pending");
  assert.deepEqual(JSON.parse(readFileSync(join(pkg, "prototype.json"), "utf8")).entries, []);
  // Stand in for the project's own multi-page build.
  const page = "<!doctype html><h1>Welcome</h1>";
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "prototype", private: true, scripts: { build: "node build.mjs" } }));
  writeFileSync(join(pkg, "prototype.json"), JSON.stringify({ schemaVersion: 1, entries: [
    { id: "welcome", title: "Welcome", sourcePath: "packages/prototype/src/welcome.html", kind: "page", devices: ["pc-web"] },
  ] }));
  for (const file of ["src/welcome.html", "preview/welcome/index.html", "dist/welcome/index.html"]) {
    mkdirSync(dirname(join(pkg, file)), { recursive: true });
    writeFileSync(join(pkg, file), page);
  }
  assert.equal(run("enable").status, "enabled");
  assert.deepEqual(run("validate"), { entries: 1, mode: "static" });
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Prototype");

  const outside = mkdtempSync(join(tmpdir(), "spec-trail-publication-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const entries = join(outside, "entries.json");
  const request = join(outside, "request.json");
  writeFileSync(entries, JSON.stringify([{ id: "welcome", entryPath: "welcome/index.html" }]));
  const prepared = run("prepare", "--directory", "packages/prototype/dist", "--entries", entries,
    "--repository", "https://example.org/team/project.git", "--out", request);
  assert.equal(prepared.path, request);
  assert.equal(prepared.requestId, JSON.parse(readFileSync(request, "utf8")).requestId);
});
