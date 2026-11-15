import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fixture } from "./fixture.ts";
const cli = resolve(".agents/skills/spec-trail/cli.mjs");
const run = (repo: string, command: string, args: string[] = []) =>
  spawnSync(
    process.execPath,
    [cli, "prototype", command, "--repo", repo, ...args],
    { cwd: repo, encoding: "utf8" },
  );
const config = async (repo: string) =>
  JSON.parse(await readFile(join(repo, "docs/project/workflow.json"), "utf8"));
// accept leaves the build to the project's toolchain; stand in for its script.
const wireBuild = async (repo: string) => {
  const file = join(repo, "packages/prototype/package.json");
  const value = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...value, scripts: { build: "node build.mjs" } }));
};
const preview = "packages/prototype/preview/welcome/index.html";

test("setup persists refusal, waits for the project build, reuses design and preserves user edits", async (t) => {
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
  assert.equal(run(f.author, "decline").status, 0);
  assert.deepEqual((await config(f.author)).prototype, { status: "disabled" });
  let result = run(f.author, "accept", ["--design", "docs/design.md"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "pending");
  const pkg = join(f.author, "packages/prototype");
  const design = await readFile(join(pkg, "DESIGN.md"), "utf8");
  assert.match(design, /\.\.\/\.\.\/docs\/design.md/);
  assert.match(run(f.author, "enable").stderr, /no build script/);
  await writeFile(
    join(pkg, "AGENTS.md"),
    "Keep my project-specific instructions\n",
  );
  await writeFile(join(pkg, "DESIGN.md"), "# My reviewed design rules\n");
  await wireBuild(f.author);
  await f.put(preview, "<!doctype html><h1>Welcome</h1>");
  result = run(f.author, "accept");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await config(f.author)).prototype, {
    status: "enabled",
    packagePath: "packages/prototype",
  });
  assert.equal(
    await readFile(join(pkg, "AGENTS.md"), "utf8"),
    "Keep my project-specific instructions\n",
  );
  assert.equal(
    await readFile(join(pkg, "DESIGN.md"), "utf8"),
    "# My reviewed design rules\n",
  );
  const root = JSON.parse(
    await readFile(join(f.author, "package.json"), "utf8"),
  );
  assert.equal(root.scripts.build, "existing");
  assert.deepEqual(root.workspaces, ["packages/prototype"]);
  assert.equal(
    run(f.author, "accept", ["--package", "other/prototype"]).status,
    1,
  );
  await symlink(resolve("node_modules"), join(f.author, "node_modules"), "dir");
  result = run(f.author, "validate", ["--browser"]);
  assert.equal(result.status, 0, result.stderr);
});

test("failed adoption remains pending and symlinked previews are rejected", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put("packages/prototype/notes.md", "existing project\n");
  const result = run(f.author, "accept");
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
  assert.equal(run(f.author, "accept").status, 0);
  await wireBuild(f.author);
  await mkdir(dirname(join(f.author, preview)), { recursive: true });
  const outside = join(f.root, "outside.html");
  await writeFile(outside, "<!doctype html><h1>Outside</h1>");
  await symlink(outside, join(f.author, preview));
  assert.equal(run(f.author, "enable").status, 1);
  assert.equal((await config(f.author)).prototype.status, "pending");
});

test("browser export validation permits runtime storage, requests and workers", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assert.equal(run(f.author, "accept").status, 0);
  await wireBuild(f.author);
  await f.put(
    preview,
    '<!doctype html><h1>Interactive export</h1><script>localStorage.setItem("prototype", "ok"); fetch(location.href); const worker = new Worker(URL.createObjectURL(new Blob(["postMessage(1)"]))); worker.onmessage = () => worker.terminate();</script>',
  );
  assert.equal(run(f.author, "enable").status, 0);
  assert.equal(run(f.author, "validate").status, 0); // Static checks are deliberately not a runtime guarantee.
  const result = run(f.author, "validate", [
    "--browser",
    "--playwright",
    resolve("node_modules/@playwright/test/index.mjs"),
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test("pnpm workspace integration respects matching exclusions while preserving unrelated rules", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const yaml =
    "packages:\n  - 'packages/*'\n  - '!**/test/**'\nonlyBuiltDependencies:\n  - esbuild\n";
  await f.put("pnpm-workspace.yaml", yaml);
  let result = run(f.author, "accept");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(join(f.author, "pnpm-workspace.yaml"), "utf8"),
    yaml,
  );
  await wireBuild(f.author);
  assert.equal(run(f.author, "enable").status, 0);
  await f.put(
    "pnpm-workspace.yaml",
    "packages:\n  - 'packages/*'\n  - '!packages/prototype'\n",
  );
  result = run(f.author, "enable");
  assert.equal(result.status, 1);
  assert.equal((await config(f.author)).prototype.status, "pending");
  await f.put("pnpm-workspace.yaml", yaml);
  assert.equal(run(f.author, "enable").status, 0);
});

test("hosting choices persist through setup and disable, invalid changes preserve workflow", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  let result = run(f.author, "accept", [
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
  const packageBefore = await readFile(
    join(f.author, "packages/prototype/package.json"),
    "utf8",
  );
  assert.equal(run(f.author, "decline").status, 0);
  assert.deepEqual(
    (await config(f.author)).prototype.hosting,
    workflow.prototype.hosting,
  );
  assert.equal(run(f.author, "accept").status, 0);
  assert.deepEqual(await config(f.author), workflow);
  result = run(f.author, "configure", [
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
  result = run(f.author, "configure", ["--hosting", "git"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await config(f.author)).prototype.hosting, {
    provider: "git",
  });
  const before = await readFile(
    join(f.author, "docs/project/workflow.json"),
    "utf8",
  );
  result = run(f.author, "configure", ["--hosting", "openfolio"]);
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
