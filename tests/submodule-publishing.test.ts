import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { submoduleFixture } from "./submodule-fixture.ts";
import {
  prepare,
  register,
  recover,
  withLock,
} from "../.agents/skills/spec-trail/prototype/scripts/publishing.mjs";
import { publishToDirectory } from "../.agents/skills/spec-trail/prototype/examples/filesystem-host.mjs";
import {
  localPackage,
  sourceManifest,
  assertSourceEntry,
} from "../.agents/skills/spec-trail/prototype/scripts/local-source.mjs";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { preflight } from "../.agents/skills/spec-trail/scripts/integration.mjs";
import { repository } from "../.agents/skills/spec-trail/scripts/repository.mjs";
const hook = resolve(".agents/skills/spec-trail/setup/scripts/pre-commit.js");
const setup = resolve(".agents/skills/spec-trail/prototype/scripts/setup.mjs");
test("declared source and dependencies inside preview are never exempted as generated output", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const manifestPath = join(f.child, f.path("prototype.json"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.entries[0].sourcePath = f.path("preview/source.tsx");
  await f.childPut(manifest.entries[0].sourcePath, "committed source");
  await writeFile(manifestPath, JSON.stringify(manifest));
  f.childCommit();
  f.commit();
  await f.childPut(manifest.entries[0].sourcePath, "uncommitted source");
  assert.throws(
    () => register(f.author, { gitEntry: "screen" }),
    /uncommitted/,
  );
  f.childGit(["restore", "--", manifest.entries[0].sourcePath]);
  await f.childPut(f.path("preview/dependency.js"), "uncommitted dependency");
  assert.throws(
    () => register(f.author, { gitEntry: "screen" }),
    /uncommitted/,
  );
});
test("unrelated submodule mapping edits do not require the prototype submodule to be initialized", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  f.git(["submodule", "deinit", "-f", "frontend"]);
  f.git(["config", "-f", ".gitmodules", "submodule.backend.path", "backend"]);
  f.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.backend.url",
    "https://example.test/team/backend.git",
  ]);
  f.git(["add", ".gitmodules"]);
  f.git(["update-index", "--add", "--cacheinfo", `160000,${f.a},backend`]);
  const run = () =>
    spawnSync(process.execPath, [hook], { cwd: f.author, encoding: "utf8" });
  let checked = run();
  assert.equal(checked.status, 0, checked.stderr);
  f.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.frontend.url",
    "https://example.test/team/new-frontend.git",
  ]);
  f.git(["add", ".gitmodules"]);
  checked = run();
  assert.notEqual(checked.status, 0);
  assert.match(checked.stderr, /frontend.*未初始化/);
});
test("Git registration rejects an uncommitted sourcePath change hidden inside catalog metadata", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  await f.childPut(f.path("src/alternate.html"), "alternate source");
  f.childCommit();
  f.commit();
  const path = join(f.child, f.path("prototype.json")),
    before = await readFile(path, "utf8");
  const manifest = JSON.parse(before);
  manifest.entries[0].sourcePath = f.path("src/alternate.html");
  await writeFile(path, JSON.stringify(manifest));
  assert.throws(
    () => register(f.author, { gitEntry: "screen" }),
    /Source path changed/,
  );
  assert.equal(f.git(["diff", "--name-only", "--", "docs/project"]), "");
});
for (const directory of ["packages/prototype", ""])
  for (const type of ["git", "hosted"])
    test(`${type} publication from ${directory || "submodule root"} updates child catalog and parent Change with fixed parent provenance`, async (t) => {
      const f = await submoduleFixture(directory);
      t.after(f.cleanup);
      await f.childPut(
        "package.json",
        JSON.stringify({ name: "frontend", private: true }),
      );
      await f.childPut(
        f.path("package.json"),
        JSON.stringify({ name: "prototype", private: true }),
      );
      await f.childPut(f.path("AGENTS.md"), "# Existing frontend rules");
      await f.childPut(f.path("DESIGN.md"), "# Existing frontend theme");
      await f.childPut(".gitignore", "dist/\n");
      f.childCommit();
      f.commit();
      const id = "publish-child",
        branch = `change/${id}`;
      await f.register({ [id]: branch });
      f.git(["checkout", "-b", branch]);
      const parent = f.git(["rev-parse", "HEAD"]);
      await f.childPut(
        f.path("dist/index.html"),
        "<!doctype html><body>hosted child</body>",
      );
      const manifestPath = join(f.child, f.path("prototype.json")),
        statePath = `docs/project/changes/${id}/change.json`;
      if (type === "hosted") {
        const request = prepare(
          f.author,
          `frontend/${f.path("dist")}`,
          [{ id: "screen", entryPath: "index.html" }],
          "https://example.test/team/main.git",
        );
        assert.equal(request.sourceCommit, parent);
        const result = publishToDirectory(
          request,
          join(f.root, "static"),
          "https://static.test/",
        );
        register(f.author, { request, result, change: id });
        // Retrying a saved result accepts metadata-only registration changes.
        register(f.author, { request, result, change: id });
      } else {
        await f.childPut(
          f.path("preview/screen/index.html"),
          "<!doctype html><body>delivered child</body>",
        );
        register(f.author, { gitEntry: "screen", change: id });
      }
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")),
        state = JSON.parse(await readFile(join(f.author, statePath), "utf8"));
      assert.equal(manifest.entries[0].sourcePath, f.entry.sourcePath);
      assert.equal(manifest.entries[0].artifact.sourceCommit, parent);
      assert.equal(state.previews[0].artifact.sourceCommit, parent);
      if (type === "git") {
        assert.equal(
          manifest.entries[0].artifact.path,
          f.path("preview/screen"),
        );
        assert.equal(
          state.previews[0].artifact.path,
          `${statePath.slice(0, -12)}/previews/screen`,
        );
        assert.match(
          await readFile(
            join(f.author, state.previews[0].artifact.path, "index.html"),
            "utf8",
          ),
          /delivered child/,
        );
      }
      const child = f.childCommit();
      f.git(["add", "."]);
      const staged = localPackage(
        f.author,
        parent,
        `frontend${directory ? "/" + directory : ""}`,
        { index: true },
      );
      assert.equal(staged.revision, child);
      const checked = spawnSync(process.execPath, [hook], {
        cwd: f.author,
        encoding: "utf8",
      });
      assert.equal(checked.status, 0, checked.stderr);
      f.commit();
      assertSourceEntry(sourceManifest(f.author, parent), "screen");
      await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
      const preview = await f.store.preview(
        f.project,
        id,
        undefined,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      );
      assert.equal(preview.descriptor.entries[0].sourceAvailable, true);
      assert.equal(preview.descriptor.entries[0].available, true);
      assert.equal(
        preview.descriptor.entries[0].source!.links[0].commit,
        sourceManifest(f.author, parent).revision,
      );
      await f.childPut(f.entry.sourcePath, "dirty component source");
      if (type === "hosted")
        assert.throws(
          () =>
            prepare(
              f.author,
              `frontend/${f.path("dist")}`,
              [{ id: "screen", entryPath: "index.html" }],
              "https://example.test/team/main.git",
            ),
          /uncommitted/,
        );
      else
        assert.throws(
          () => register(f.author, { gitEntry: "screen", change: id }),
          /uncommitted/,
        );
      if (type === "git" && directory) {
        f.childGit(["restore", "--", f.entry.sourcePath]);
        const command = (name: string, args: string[] = []) => {
          const result = spawnSync(
            process.execPath,
            [
              resolve(".agents/skills/spec-trail/scripts/change.mjs"),
              name,
              "--change",
              id,
              "--repo",
              f.author,
              ...args,
            ],
            { encoding: "utf8" },
          );
          assert.equal(result.status, 0, result.stderr);
        };
        command("task-add", ["--title", "Deliver fixed prototype"]);
        await f.put(
          `${statePath.slice(0, -12)}/requirement.md`,
          "# Fixed child delivery",
        );
        f.commit();
        command("execute");
        command("task-start", ["--task", "T1"]);
        command("task-complete", [
          "--task",
          "T1",
          "--verification",
          "fixture verified",
        ]);
        f.commit();
        command("verify", [
          "--result",
          "passed",
          "--summary",
          "fixture verified",
        ]);
        command("accept", [
          "--mode",
          "agent",
          "--summary",
          "Agent fixture acceptance",
          "--source",
          "fixture verification",
        ]);
        command("specs", ["--result", "not_needed", "--summary", "fixture"]);
        command("archive", [
          "--date",
          "2026-10-29",
          "--summary",
          "fixed child prototype",
        ]);
        f.commit();
        const checked = await preflight(
          repository(f.author),
          id,
          f.readPullRequests,
        );
        assert.equal(checked.source!.branch, branch);
        const archived = JSON.parse(
          await readFile(
            join(f.author, `docs/project/archive/2026-10-29-${id}/change.json`),
            "utf8",
          ),
        );
        assert.equal(archived.previews[0].artifact.sourceCommit, parent);
        assert.match(
          await readFile(
            join(f.author, archived.previews[0].artifact.path, "index.html"),
            "utf8",
          ),
          /delivered child/,
        );
      }
    });
test("index validation uses staged gitlink even when checkout points at a different child version", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const a = f.a;
  await f.childPut(f.path("prototype.json"), "{broken");
  const b = f.childCommit();
  f.git(["add", "frontend"]);
  f.childGit(["checkout", a]);
  const run = () =>
    spawnSync(process.execPath, [hook], { cwd: f.author, encoding: "utf8" });
  assert.notEqual(run().status, 0);
  assert.equal(
    localPackage(f.author, f.revision, "frontend/packages/prototype", {
      index: true,
    }).revision,
    b,
  );
  f.git(["update-index", "--cacheinfo", `160000,${a},frontend`]);
  assert.equal(run().status, 0);
  await f.childPut(f.entry.sourcePath, "dirty");
  assert.throws(
    () =>
      prepare(
        f.author,
        "frontend/packages/prototype/preview",
        [{ id: "screen", entryPath: "screen/index.html" }],
        "https://example.test/main.git",
      ),
    /uncommitted/,
  );
});
test("submodule adoption preserves parent workspaces and existing frontend configuration", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  await f.put(
    "package.json",
    JSON.stringify({ name: "parent", private: true, workspaces: ["backend"] }),
  );
  for (const [path, body] of [
    ["package.json", JSON.stringify({ name: "prototype", private: true })],
    ["AGENTS.md", "# custom rules"],
    ["DESIGN.md", "# custom design"],
  ])
    await f.childPut(f.path(path), body);
  f.childCommit();
  f.commit();
  const before = await readFile(join(f.author, "package.json"), "utf8");
  const result = spawnSync(
    process.execPath,
    [setup, "--enable", "--repo", f.author],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(f.author, "package.json"), "utf8"), before);
  assert.equal(
    await readFile(join(f.child, f.path("AGENTS.md")), "utf8"),
    "# custom rules",
  );
});
test("two-repository recovery locks participants and stops at later edits or commits", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const path = `frontend/${f.path("prototype.json")}`,
    file = join(f.author, path),
    before = await readFile(file, "utf8"),
    after = before + "\n";
  const journal = join(
    f.author,
    ".git",
    "spec-trail-prototype-transaction.json",
  );
  const record = {
    root: f.author,
    repositories: [
      { path: "", head: f.revision },
      { path: "frontend", head: f.a },
    ],
    files: [
      {
        path,
        before: Buffer.from(before).toString("base64"),
        after: Buffer.from(after).toString("base64"),
      },
    ],
  };
  await writeFile(journal, JSON.stringify(record));
  await writeFile(file, "later edit");
  assert.throws(() => recover(f.author), /newer edits/);
  await writeFile(file, after);
  withLock(f.child, () => assert.throws(() => recover(f.author), /holds/));
  recover(f.author);
  assert.equal(await readFile(file, "utf8"), before);
  await writeFile(journal, JSON.stringify(record));
  await writeFile(file, after);
  f.childCommit();
  assert.throws(() => recover(f.author), /newer repository commits/);
});
