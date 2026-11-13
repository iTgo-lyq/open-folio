import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

test("CLI help and argument errors work outside a Git project", t => {
  const cwd = mkdtempSync(join(tmpdir(), "spec-trail-cli-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const run = args => spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });

  for (const [args, expected] of [
    [["--help"], /Groups:.*change.*workspace/],
    [["change", "--help"], /Commands:.*task-start/],
    [["change", "task-start", "--help"], /--change <value> --task <value>/],
    [["maintenance", "archive-tags-delete", "--help"], / --service-ready \[--help\]/],
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
    [["change", "task-start", "--change", "example"], /--task is required/],
    [["maintenance", "archive-tags-delete", "--manifest", "missing.json"], /--service-ready is required/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Usage:/);
  }
});

test("prototype scaffold logs stay out of the JSON result", {
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
    return { output: JSON.parse(result.stdout), diagnostics: result.stderr };
  };
  const configured = run("accept", "--hosting", "custom");
  assert.equal(configured.output.status, "enabled");
  assert.match(configured.diagnostics, /Exported 1 self-contained preview/);
  const preview = join(cwd, "packages/prototype/preview/welcome");
  mkdirSync(preview, { recursive: true });
  writeFileSync(join(preview, "index.html"), readFileSync(join(cwd, "packages/prototype/dist/welcome/index.html")));
  assert.deepEqual(run("validate").output, { entries: 1, mode: "static" });
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Prototype");

  const outside = mkdtempSync(join(tmpdir(), "spec-trail-publication-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const entries = join(outside, "entries.json");
  const request = join(outside, "request.json");
  writeFileSync(entries, JSON.stringify([{ id: "welcome", entryPath: "welcome/index.html" }]));
  const prepared = run("prepare", "--directory", "packages/prototype/dist", "--entries", entries,
    "--repository", "https://example.org/team/project.git", "--out", request).output;
  assert.equal(prepared.path, request);
  assert.equal(prepared.requestId, JSON.parse(readFileSync(request, "utf8")).requestId);
});
