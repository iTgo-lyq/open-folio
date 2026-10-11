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
  assert.equal(run(f.author, "setup.mjs", ["--decline"]).status, 0);
  assert.deepEqual((await config(f.author)).prototype, { status: "disabled" });
  let result = run(f.author, "setup.mjs", [
    "--accept",
    "--design",
    "docs/design.md",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await config(f.author)).prototype, {
    status: "enabled",
    packagePath: "packages/prototype",
  });
  const pkg = join(f.author, "packages/prototype");
  const design = await readFile(join(pkg, "DESIGN.md"), "utf8");
  assert.match(design, /\.\.\/\.\.\/docs\/design.md/);
  await writeFile(
    join(pkg, "AGENTS.md"),
    "Keep my project-specific instructions\n",
  );
  result = run(f.author, "setup.mjs", ["--accept"]);
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
    run(f.author, "setup.mjs", ["--accept", "--package", "other/prototype"])
      .status,
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
  const result = run(f.author, "setup.mjs", ["--accept"]);
  assert.equal(result.status, 1);
  assert.deepEqual((await config(f.author)).prototype, {
    status: "pending",
    packagePath: "packages/prototype",
  });
  assert.equal(
    await readFile(join(f.author, "packages/prototype/notes.md"), "utf8"),
    "existing project\n",
  );
  await rm(join(f.author, "packages/prototype"), { recursive: true });
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
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
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
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
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
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
          artifact: {
            type: "git",
            path: "packages/prototype/preview/welcome",
            sourceCommit: f.git(["rev-parse", "HEAD"]),
          },
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
    f.git(["rev-parse", "refs/tags/spec-trail/archive-v2/demo"]),
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
    f.git(["rev-parse", "refs/tags/spec-trail/archive-v2/demo"]),
    revision,
  );
});

test("archive accepts an existing annotated tag that retains the same completed commit", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
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
          artifact: {
            type: "git",
            path: "packages/prototype/preview/welcome",
            sourceCommit: f.git(["rev-parse", "HEAD"]),
          },
          kind: "page",
          devices: ["pc-web"],
        },
      ],
    }),
  );
  const revision = f.commit(),
    ref = "refs/tags/spec-trail/archive-v2/annotated";
  f.git([
    "tag",
    "-a",
    "spec-trail/archive-v2/annotated",
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

test("pnpm workspace integration respects matching exclusions while preserving unrelated rules", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const yaml =
    "packages:\n  - 'packages/*'\n  - '!**/test/**'\nonlyBuiltDependencies:\n  - esbuild\n";
  await f.put("pnpm-workspace.yaml", yaml);
  let result = run(f.author, "setup.mjs", ["--accept"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(join(f.author, "pnpm-workspace.yaml"), "utf8"),
    yaml,
  );
  assert.equal(run(f.author, "setup.mjs", ["--enable"]).status, 0);
  await f.put(
    "pnpm-workspace.yaml",
    "packages:\n  - 'packages/*'\n  - '!packages/prototype'\n",
  );
  result = run(f.author, "setup.mjs", ["--enable"]);
  assert.equal(result.status, 1);
  assert.equal((await config(f.author)).prototype.status, "pending");
  await f.put("pnpm-workspace.yaml", yaml);
  assert.equal(run(f.author, "setup.mjs", ["--enable"]).status, 0);
});

test("shared source inlining preserves JavaScript replacement strings verbatim", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
  const source = "window.render = 'abc'.replace(/b/g, '[$&]');";
  await f.put("packages/prototype/src/shared/replace.js", source);
  await f.put(
    "packages/prototype/src/pages/replace.html",
    "<!doctype html><html><script>{{include:../shared/replace.js}}</script></html>",
  );
  const result = spawnSync(
    process.execPath,
    [join(f.author, "packages/prototype/build.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(
    join(f.author, "packages/prototype/preview/replace/index.html"),
    "utf8",
  );
  const { runInNewContext } = await import("node:vm");
  const context = { window: { render: "" } };
  runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(output)![1], context);
  assert.equal(context.window.render, "a[b]c");
});

test("hosting choices persist through setup and disable, hosted scaffolds build dist, invalid changes preserve workflow", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  let result = run(f.author, "setup.mjs", [
    "--accept",
    "--hosting",
    "openfolio",
    "--openfolio-url",
    "http://localhost:10681",
    "--upload-url",
    "http://localhost:10681/api/prototype-uploads/test",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const workflow = await config(f.author);
  assert.equal(workflow.openfolioUrl, "http://localhost:10681");
  assert.equal(workflow.prototype.hosting.provider, "openfolio");
  assert.match(
    await readFile(
      join(f.author, "packages/prototype/dist/welcome/index.html"),
      "utf8",
    ),
    /<!doctype html>/i,
  );
  const packageBefore = await readFile(
    join(f.author, "packages/prototype/package.json"),
    "utf8",
  );
  assert.equal(run(f.author, "setup.mjs", ["--decline"]).status, 0);
  assert.deepEqual(
    (await config(f.author)).prototype.hosting,
    workflow.prototype.hosting,
  );
  assert.equal(run(f.author, "setup.mjs", ["--accept"]).status, 0);
  assert.deepEqual(await config(f.author), workflow);
  result = run(f.author, "setup.mjs", [
    "--configure",
    "--hosting",
    "custom",
    "--openfolio-url",
    "none",
    "--upload-url",
    "http://custom.test/upload",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await config(f.author)).openfolioUrl, null);
  assert.equal((await config(f.author)).prototype.hosting.provider, "custom");
  result = run(f.author, "setup.mjs", ["--configure", "--hosting", "git"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await config(f.author)).prototype.hosting, {
    provider: "git",
  });
  const before = await readFile(
    join(f.author, "docs/project/workflow.json"),
    "utf8",
  );
  result = run(f.author, "setup.mjs", [
    "--configure",
    "--hosting",
    "openfolio",
  ]);
  assert.equal(result.status, 1);
  assert.equal(
    await readFile(join(f.author, "docs/project/workflow.json"), "utf8"),
    before,
  );
  assert.equal(
    await readFile(join(f.author, "packages/prototype/package.json"), "utf8"),
    packageBefore,
  );
});
