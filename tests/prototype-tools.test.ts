import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fixture } from "./fixture.ts";
const scripts = resolve(".agents/skills/spec-trail/prototype/scripts");
const run = (repo: string, script: string, args: string[] = []) =>
  spawnSync(
    process.execPath,
    [join(scripts, script), "--repo", repo, ...args],
    { cwd: repo, encoding: "utf8" },
  );
const config = async (repo: string) =>
  JSON.parse(await readFile(join(repo, "docs/project/workflow.json"), "utf8"));

test("setup persists refusal, initializes one package, reuses design and preserves user edits", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "package.json",
    JSON.stringify({
      name: "project",
      private: true,
      scripts: { build: "existing" },
    }),
  );
  await f.put("docs/design.md", "# Existing project design\n");
  assert.equal(
    run(f.author, "setup.mjs", ["--decline", "--summary", "用户拒绝"]).status,
    0,
  );
  assert.equal((await config(f.author)).prototype.status, "disabled");
  let result = run(f.author, "setup.mjs", [
    "--accept",
    "--summary",
    "用户明确重新同意",
    "--design",
    "docs/design.md",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await config(f.author)).prototype.status, "enabled");
  const pkg = join(f.author, "packages/prototype");
  const design = await readFile(join(pkg, "DESIGN.md"), "utf8");
  assert.match(design, /\.\.\/\.\.\/docs\/design.md/);
  await writeFile(
    join(pkg, "AGENTS.md"),
    "Keep my project-specific instructions\n",
  );
  result = run(f.author, "setup.mjs", [
    "--accept",
    "--summary",
    "用户原有同意",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(join(pkg, "AGENTS.md"), "utf8"),
    "Keep my project-specific instructions\n",
  );
  const root = JSON.parse(
    await readFile(join(f.author, "package.json"), "utf8"),
  );
  assert.equal(root.scripts.build, "existing");
  assert.deepEqual(root.workspaces, ["packages/prototype"]);
  assert.equal(
    run(f.author, "setup.mjs", [
      "--accept",
      "--summary",
      "不能再创建第二份",
      "--package",
      "other/prototype",
    ]).status,
    1,
  );
  await symlink(resolve("node_modules"), join(f.author, "node_modules"), "dir");
  result = run(f.author, "validate.mjs", ["--browser"]);
  assert.equal(result.status, 0, result.stderr);
});

test("failed adoption remains pending and output symlink cannot overwrite outside files", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put("packages/prototype/notes.md", "existing project\n");
  const result = run(f.author, "setup.mjs", [
    "--accept",
    "--summary",
    "用户同意",
  ]);
  assert.equal(result.status, 1);
  assert.equal((await config(f.author)).prototype.status, "pending");
  assert.equal(
    await readFile(join(f.author, "packages/prototype/notes.md"), "utf8"),
    "existing project\n",
  );
  await rm(join(f.author, "packages/prototype"), { recursive: true });
  assert.equal(
    run(f.author, "setup.mjs", [
      "--accept",
      "--summary",
      "用户同意，修复后重试",
    ]).status,
    0,
  );
  const target = join(
    f.author,
    "packages/prototype/preview/welcome/index.html",
  );
  await rm(target);
  const outside = join(f.root, "outside.txt");
  await writeFile(outside, "untouched");
  await symlink(outside, target);
  const build = spawnSync(
    process.execPath,
    [join(f.author, "packages/prototype/build.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 1);
  assert.equal(await readFile(outside, "utf8"), "untouched");
  assert.equal(run(f.author, "validate.mjs").status, 1);
});

test("browser export validation catches runtime network dependencies without relaxing CSP", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(
    run(f.author, "setup.mjs", ["--accept", "--summary", "用户同意"]).status,
    0,
  );
  await f.put(
    "packages/prototype/preview/welcome/index.html",
    '<!doctype html><h1>Broken export</h1><script>fetch("https://example.invalid/private").catch(()=>{})</script>',
  );
  assert.equal(run(f.author, "validate.mjs").status, 0); // Static checks are deliberately not a runtime guarantee.
  const result = run(f.author, "validate.mjs", [
    "--browser",
    "--playwright",
    resolve("node_modules/@playwright/test/index.mjs"),
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Content Security Policy|violates|connect-src/i);
});

test("archive publishes a retained tag atomically, is idempotent and never overwrites a revision", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(
    run(f.author, "setup.mjs", ["--accept", "--summary", "用户同意"]).status,
    0,
  );
  const at = "2026-10-03T01:30:00+08:00",
    step = (result: string) => ({ at, summary: "verified", result });
  const path = "docs/project/archive/2026-10-03-demo";
  await f.put(
    `${path}/change.json`,
    JSON.stringify({
      schemaVersion: 1,
      id: "demo",
      title: "Demo",
      branch: "main",
      size: "small",
      status: "completed",
      stage: "close",
      confirmations: {},
      tasks: { T1: { title: "交付", status: "done" } },
      closure: {
        verification: step("passed"),
        acceptance: step("accepted"),
        specs: step("not_needed"),
        archive: { ...step("done"), path },
      },
      previews: [
        {
          id: "welcome",
          title: "Welcome",
          path: "packages/prototype/preview/welcome",
          kind: "page",
          devices: ["pc-web"],
        },
      ],
    }),
  );
  const revision = f.commit();
  let result = run(f.author, "archive.mjs", ["--change", "demo", "--push"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    f.git(["rev-parse", "refs/tags/spec-trail/archive/demo"]),
    revision,
  );
  assert.equal(
    run(f.author, "archive.mjs", ["--change", "demo", "--push"]).status,
    0,
  );
  await f.put("next.txt", "next version");
  f.commit();
  result = run(f.author, "archive.mjs", ["--change", "demo", "--push"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /never overwrite/);
  assert.equal(
    f.git(["rev-parse", "refs/tags/spec-trail/archive/demo"]),
    revision,
  );
});

test("archive accepts an existing annotated tag that retains the same completed commit", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(
    run(f.author, "setup.mjs", ["--accept", "--summary", "用户同意"]).status,
    0,
  );
  const path = "docs/project/archive/2026-10-03-annotated",
    at = "2026-10-03T01:30:00+08:00";
  const step = (result: string) => ({ at, summary: "verified", result });
  await f.put(
    `${path}/change.json`,
    JSON.stringify({
      schemaVersion: 1,
      id: "annotated",
      title: "Annotated",
      branch: "main",
      size: "small",
      status: "completed",
      stage: "close",
      confirmations: {},
      tasks: { T1: { title: "交付", status: "done" } },
      closure: {
        verification: step("passed"),
        acceptance: step("accepted"),
        specs: step("not_needed"),
        archive: { ...step("done"), path },
      },
      previews: [
        {
          id: "welcome",
          title: "Welcome",
          path: "packages/prototype/preview/welcome",
          kind: "page",
          devices: ["pc-web"],
        },
      ],
    }),
  );
  const revision = f.commit(),
    ref = "refs/tags/spec-trail/archive/annotated";
  f.git([
    "tag",
    "-a",
    "spec-trail/archive/annotated",
    "-m",
    "Retain completed prototype",
    revision,
  ]);
  const result = run(f.author, "archive.mjs", [
    "--change",
    "annotated",
    "--push",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    f.git(["ls-remote", "origin", `${ref}^{}`]),
    new RegExp(`^${revision}\\t`),
  );
  assert.equal(
    run(f.author, "archive.mjs", ["--change", "annotated", "--push"]).status,
    0,
  );
});
