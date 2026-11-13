import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("CLI help and argument errors work outside a Git project", t => {
  const run = outsideProject(t);

  for (const [args, expected] of [
    [["--help"], /^  create --change <id> --title <text> --size <small\|medium\|large\|xlarge> /m],
    [["change", "--help"], /^  task-start --change <id> --task <Tn> \[--repo <path>\] \[--dry-run\]$/m],
    [["change", "task-start", "--help"], /--task <Tn> +\(required\) Task id such as T1/],
    [["maintenance", "archive-tags-delete", "--help"], /--manifest <file> --service-ready \[--repo <path>\]/],
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
    [["change", "verify", "--change", "example", "--result", "maybe", "--summary", "done"], /--result must be one of: passed, failed/],
    [["prototype", "configure", "--hosting", "s3"], /--hosting must be one of: openfolio, custom, git/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Usage:/);
  }
});

test("help gives runnable usage for every command and documents every option", async t => {
  const { commands, groups } = await import("../scripts/cli-commands.mjs");
  const run = outsideProject(t);
  const help = (...args) => {
    const result = run([...args, "--help"]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const overview = help();

  for (const [group, entries] of Object.entries(commands)) {
    assert.ok(groups[group]?.summary, `${group} needs a summary`);
    const section = help(group).split("\n");
    for (const [name, spec] of Object.entries(entries)) {
      assert.ok(spec.summary, `${group} ${name} needs a summary`);
      const usage = section.find(line => line.startsWith(`  ${name} `));
      assert.ok(usage && overview.includes(`${usage}\n      ${spec.summary}`), `${group} ${name} is missing from the overview`);
      const details = help(group, name);
      assert.match(details, /^Options:$/m);
      assert.ok(details.includes(`Example:\n  node .agents/skills/spec-trail/cli.mjs ${group} ${name}`));
      for (const [option, value] of Object.entries(spec.options)) {
        assert.ok(value.text, `${group} ${name} --${option} needs help text`);
        assert.ok(value.type === "boolean" || value.value || value.choices, `${group} ${name} --${option} needs a value format`);
        assert.match(usage, new RegExp(`--${option}(?=[ \\]]|$)`));
        assert.ok(details.includes(value.text), `${group} ${name} --${option} help is not shown`);
      }
    }
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
