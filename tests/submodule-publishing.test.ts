import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { submoduleFixture } from "./submodule-fixture.ts";
import {
  prepare,
  associate,
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
    () =>
      register(f.child, {
        gitEntry: "screen",
        packagePath: "packages/prototype",
        repository: "https://example.test/team/frontend.git",
      }),
    /uncommitted/,
  );
  f.childGit(["restore", "--", manifest.entries[0].sourcePath]);
  await f.childPut(f.path("preview/dependency.js"), "uncommitted dependency");
  assert.throws(
    () =>
      register(f.child, {
        gitEntry: "screen",
        packagePath: "packages/prototype",
        repository: "https://example.test/team/frontend.git",
      }),
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
    () =>
      register(f.child, {
        gitEntry: "screen",
        packagePath: "packages/prototype",
        repository: "https://example.test/team/frontend.git",
      }),
    /Source path changed/,
  );
  assert.equal(f.git(["diff", "--name-only", "--", "docs/project"]), "");
});
for (const directory of ["packages/prototype", ""])
  for (const type of ["git", "hosted"])
    test(`${type} frontend-first publication from ${directory || "submodule root"} associates with one parent commit`, async (t) => {
      const f = await submoduleFixture(directory);
      t.after(f.cleanup);
      const id = "publish-child",
        branch = `change/${id}`;
      await f.register({ [id]: branch });
      f.git(["checkout", "-b", branch]);
      if (type === "git" && directory) {
        await f.put(
          `docs/project/changes/${id}/requirement.md`,
          "# Existing Change before publication",
        );
        f.commit();
      }
      const parent = f.git(["rev-parse", "HEAD"]);
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
      const sourceCommit = f.childCommit();
      await f.childPut(
        f.path("dist/index.html"),
        "<!doctype html><body>hosted child</body>",
      );
      const manifestPath = join(f.child, f.path("prototype.json")),
        statePath = `docs/project/changes/${id}/change.json`;
      if (type === "hosted") {
        const request = prepare(
          f.child,
          f.path("dist"),
          [{ id: "screen", entryPath: "index.html" }],
          "https://example.test/team/frontend.git",
          directory || ".",
        );
        assert.equal(request.sourceCommit, sourceCommit);
        assert.equal(request.packagePath, directory);
        const result = publishToDirectory(
          request,
          join(f.root, "static"),
          "https://static.test/",
        );
        register(f.child, { request, result });
        // Retrying a saved result accepts metadata-only registration changes.
        register(f.child, { request, result });
      } else {
        await f.childPut(
          f.path("preview/screen/index.html"),
          "<!doctype html><body>delivered child</body>",
        );
        register(f.child, {
          gitEntry: "screen",
          packagePath: directory || ".",
          repository: "https://example.test/team/frontend.git",
        });
      }
      const child = f.childCommit();
      assert.equal(f.git(["rev-parse", "HEAD"]), parent);
      assert.equal(f.git(["rev-parse", "HEAD:frontend"]), f.a);
      assert.throws(() => f.git(["cat-file", "-t", sourceCommit]));
      const catalog = await readFile(manifestPath, "utf8");
      associate(f.author, { change: id, entry: "screen" });
      assert.equal(await readFile(manifestPath, "utf8"), catalog);
      assert.equal(f.childGit(["rev-parse", "HEAD"]), child);
      assert.equal(f.childGit(["status", "--porcelain"]), "");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")),
        state = JSON.parse(await readFile(join(f.author, statePath), "utf8"));
      assert.equal(manifest.entries[0].sourcePath, f.entry.sourcePath);
      assert.equal(manifest.entries[0].artifact.sourceCommit, sourceCommit);
      assert.equal(state.previews[0].artifact.sourceCommit, sourceCommit);
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
      const validated = spawnSync(
        process.execPath,
        [
          resolve(".agents/skills/spec-trail/prototype/scripts/validate.mjs"),
          "--repo",
          f.child,
          "--package",
          directory || ".",
        ],
        { encoding: "utf8" },
      );
      assert.equal(validated.status, 0, validated.stderr);
      assert.deepEqual(manifest.entries[0].artifact.source, {
        repository: "https://example.test/team/frontend.git",
        packagePath: directory,
      });
      assert.deepEqual(state.previews[0].artifact.source, {
        ...manifest.entries[0].artifact.source,
        submodulePath: "frontend",
        catalogCommit: child,
        bindingCommit: parent,
      });
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
      assert.equal(f.git(["rev-list", "--count", `${parent}..HEAD`]), "1");
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
        sourceCommit,
      );
      await f.childPut(f.entry.sourcePath, "source from newer frontend branch");
      f.childCommit();
      f.commit();
      await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
      const historical = await f.store.preview(
        f.project,
        id,
        undefined,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      );
      assert.equal(
        historical.descriptor.entries[0].artifact!.sourceCommit,
        sourceCommit,
      );
      assert.equal(historical.descriptor.entries[0].sourceAvailable, true);
      assert.equal(
        historical.descriptor.entries[0].source!.links[0].commit,
        sourceCommit,
      );
      assert.deepEqual(
        historical.descriptor.entries[0].artifact,
        preview.descriptor.entries[0].artifact,
      );
      f.deny();
      const denied = await f.store.preview(
        f.project,
        id,
        undefined,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      );
      assert.equal(denied.descriptor.entries[0].available, true);
      assert.equal(denied.descriptor.entries[0].sourceAvailable, false);
      assert.match(denied.descriptor.entries[0].sourceMessage!, /无权访问/);
      f.allow();
      await f.childPut(f.entry.sourcePath, "dirty component source");
      if (type === "hosted")
        assert.throws(
          () =>
            prepare(
              f.child,
              f.path("dist"),
              [{ id: "screen", entryPath: "index.html" }],
              "https://example.test/team/frontend.git",
              directory || ".",
            ),
          /uncommitted/,
        );
      else
        assert.throws(
          () =>
            register(f.child, {
              gitEntry: "screen",
              packagePath: directory || ".",
              repository: "https://example.test/team/frontend.git",
            }),
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
        const retained = join(f.root, "retained-previews.json");
        await writeFile(
          retained,
          JSON.stringify(
            JSON.parse(await readFile(join(f.author, statePath), "utf8"))
              .previews,
          ),
        );
        command("previews-set", ["--file", retained]);
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
        f.git(["checkout", "develop"]);
        const fromMain = await preflight(
          repository(f.author),
          id,
          f.readPullRequests,
        );
        assert.equal(fromMain.source!.branch, branch);
        f.git(["checkout", branch]);
        const archived = JSON.parse(
          await readFile(
            join(f.author, `docs/project/archive/2026-10-29-${id}/change.json`),
            "utf8",
          ),
        );
        assert.equal(archived.previews[0].artifact.sourceCommit, sourceCommit);
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
        f.child,
        "packages/prototype/preview",
        [{ id: "screen", entryPath: "screen/index.html" }],
        "https://example.test/team/frontend.git",
        "packages/prototype",
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

test("association rejects dirty catalogs, mismatched source identities and commits outside the pinned history", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const id = "associate-guards";
  await f.register({ [id]: `change/${id}` });
  f.git(["checkout", "-b", `change/${id}`]);
  const before = await readFile(
    join(f.author, `docs/project/changes/${id}/change.json`),
    "utf8",
  );
  await f.childPut(f.entry.sourcePath, "new source for association");
  const sourceCommit = f.childCommit();
  const unrelated = f.childGit([
    "commit-tree",
    f.childGit(["rev-parse", "HEAD^{tree}"]),
    "-m",
    "unrelated source",
  ]);
  register(f.child, {
    gitEntry: "screen",
    packagePath: "packages/prototype",
    repository: "https://example.test/team/frontend.git",
  });
  const path = join(f.child, f.path("prototype.json")),
    published = await readFile(path, "utf8");
  assert.throws(
    () => associate(f.author, { change: id }),
    /Commit the frontend catalog/,
  );
  assert.throws(
    () => register(f.author, { gitEntry: "screen", change: id }),
    /frontend repository with --package/,
  );
  const catalog = JSON.parse(published);
  const invalid = [
    [
      {
        repository: "https://example.test/other.git",
        packagePath: "packages/prototype",
      },
      sourceCommit,
      /仓库身份/,
    ],
    [
      {
        repository: "https://example.test/team/frontend.git",
        packagePath: "other",
      },
      sourceCommit,
      /包路径/,
    ],
    [
      {
        repository: "https://example.test/team/frontend.git",
        packagePath: "packages/prototype",
      },
      unrelated,
      /历史/,
    ],
  ] as const;
  for (const [source, commit, error] of invalid) {
    catalog.entries[0].artifact.source = source;
    catalog.entries[0].artifact.sourceCommit = commit;
    await writeFile(path, JSON.stringify(catalog));
    f.childCommit();
    assert.throws(() => associate(f.author, { change: id }), error);
    assert.equal(
      await readFile(
        join(f.author, `docs/project/changes/${id}/change.json`),
        "utf8",
      ),
      before,
    );
  }
  await writeFile(path, published);
  f.childCommit();
  associate(f.author, { change: id });
  f.git(["add", "."]);
  // A staged gitlink without the published source in its history must fail,
  // even while the checkout still contains that publication.
  f.git(["update-index", "--cacheinfo", `160000,${f.a},frontend`]);
  const checked = spawnSync(process.execPath, [hook], {
    cwd: f.author,
    encoding: "utf8",
  });
  assert.notEqual(checked.status, 0);
  assert.match(checked.stderr, /暂存 gitlink/);
});

test("associating unchanged frontend sources still requires staging the new catalog gitlink and survives a later mount move", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const id = "fixed-association",
    statePath = `docs/project/changes/${id}/change.json`;
  await f.register({ [id]: `change/${id}` });
  f.git(["checkout", "-b", `change/${id}`]);
  register(f.child, {
    gitEntry: "screen",
    packagePath: "packages/prototype",
    repository: "https://example.test/team/frontend.git",
  });
  const b = f.childCommit();
  associate(f.author, { change: id });
  f.git(["add", "docs/project"]);
  const run = () =>
    spawnSync(process.execPath, [hook], { cwd: f.author, encoding: "utf8" });
  assert.notEqual(run().status, 0);
  assert.match(run().stderr, /暂存 gitlink/);
  f.git(["add", "frontend"]);
  assert.equal(run().status, 0, run().stderr);
  f.commit();
  f.git(["mv", "frontend", "frontend-v2"]);
  f.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.frontend.path",
    "frontend-v2",
  ]);
  const workflow = JSON.parse(
    await readFile(join(f.author, "docs/project/workflow.json"), "utf8"),
  );
  workflow.prototype.packagePath = "frontend-v2/packages/prototype";
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  f.commit();
  const ref = JSON.parse(await readFile(join(f.author, statePath), "utf8"))
    .previews[0];
  assert.equal(ref.artifact.source.catalogCommit, b);
  const { verifyPrototypeSource } = await import(
    "../.agents/skills/spec-trail/prototype/scripts/local-source.mjs"
  );
  verifyPrototypeSource(
    f.author,
    ref.artifact.sourceCommit,
    "screen",
    ref.artifact.source,
  );
  // The old physical path can be reused without hiding the historical object store.
  const replacement = join(f.author, "frontend");
  f.git(["init", "--initial-branch=trunk", replacement]);
  f.git(["config", "user.name", "Replacement"], replacement);
  f.git(["config", "user.email", "fixture@example.test"], replacement);
  await f.put("frontend/other.txt", "unrelated repository");
  f.git(["add", "."], replacement);
  f.git(["commit", "-m", "unrelated"], replacement);
  verifyPrototypeSource(
    f.author,
    ref.artifact.sourceCommit,
    "screen",
    ref.artifact.source,
  );

  await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const result = await f.store.preview(
    f.project,
    id,
    undefined,
    DEFAULT_LIMITS,
    undefined,
    "screen",
  );
  assert.equal(
    result.descriptor.entries[0].sourceAvailable,
    true,
    result.descriptor.entries[0].sourceMessage,
  );
  assert.equal(result.descriptor.entries[0].source!.links[0].commit, f.a);
  assert.equal(result.descriptor.entries[0].available, true);
});

test("single-repository interrupted registration refuses recovery after its catalog was committed", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const path = f.path("prototype.json"),
    before = await readFile(join(f.child, path), "utf8"),
    after = before + "\n";
  const script = new URL(
    "../.agents/skills/spec-trail/prototype/scripts/publishing.mjs",
    import.meta.url,
  ).href;
  const crashed = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
    const rename=fs.renameSync;fs.renameSync=(...args)=>{rename(...args);process.kill(process.pid,'SIGKILL');};syncBuiltinESMExports();
    const {transaction,withLock}=await import(${JSON.stringify(script)});
    withLock(${JSON.stringify(f.child)},()=>transaction(${JSON.stringify(f.child)},[{path:${JSON.stringify(path)},body:${JSON.stringify(after)}}]));
  `,
  ]);
  assert.equal(crashed.signal, "SIGKILL");
  const common = f.childGit([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const journal = JSON.parse(
    await readFile(
      join(common, "spec-trail-prototype-transaction.json"),
      "utf8",
    ),
  );
  assert.deepEqual(journal.repositories, [{ path: "", head: f.a }]);
  await rm(join(common, "spec-trail-state.lock"), { recursive: true }); // This test child is confirmed dead.
  f.childCommit();
  assert.throws(() => recover(f.child), /newer repository commits/);
  assert.equal(await readFile(join(f.child, path), "utf8"), after);
});

test("association preserves parent fixed URLs when the frontend catalog no longer knows the old publication", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  const id = "immutable-association";
  await f.register({ [id]: `change/${id}` });
  f.git(["checkout", "-b", `change/${id}`]);
  await f.childPut(".gitignore", "dist/\n");
  f.childCommit();
  const publish = async (body: string, version: string) => {
    await f.childPut(f.path("dist/index.html"), body);
    const request = prepare(
      f.child,
      f.path("dist"),
      [{ id: "screen", entryPath: "index.html" }],
      "https://example.test/team/frontend.git",
      "packages/prototype",
    );
    const result = {
      schemaVersion: 1,
      status: "published",
      requestId: request.requestId,
      sourceCommit: request.sourceCommit,
      digest: request.digest,
      version,
      entries: [{ id: "screen", url: "https://static.test/fixed/index.html" }],
    };
    register(f.child, { request, result });
    f.childCommit();
  };
  await publish("<!doctype html><body>first</body>", "first");
  associate(f.author, { change: id });
  f.commit();
  const before = await readFile(
    join(f.author, `docs/project/changes/${id}/change.json`),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(join(f.child, f.path("prototype.json")), "utf8"),
  );
  delete manifest.entries[0].artifact;
  await f.childPut(f.path("prototype.json"), JSON.stringify(manifest));
  f.childCommit();
  await publish(
    "<!doctype html><body>changed immutable bytes</body>",
    "second",
  );
  assert.throws(
    () => associate(f.author, { change: id }),
    /known immutable URL/,
  );
  assert.equal(
    await readFile(
      join(f.author, `docs/project/changes/${id}/change.json`),
      "utf8",
    ),
    before,
  );
});

test("nested frontend publication commits inner and outer catalogs before one final parent association", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  f.childGit([
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    f.remote,
    "inner",
  ]);
  f.childGit([
    "config",
    "-f",
    ".gitmodules",
    "submodule.inner.url",
    "https://example.test/team/frontend.git",
  ]);
  f.childCommit();
  const workflow = JSON.parse(
    await readFile(join(f.author, "docs/project/workflow.json"), "utf8"),
  );
  workflow.prototype.packagePath = "frontend/inner/packages/prototype";
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  f.commit();
  const id = "nested-publication";
  await f.register({ [id]: `change/${id}` });
  f.git(["checkout", "-b", `change/${id}`]);
  const parent = f.git(["rev-parse", "HEAD"]),
    inner = join(f.child, "inner");
  f.git(["config", "user.name", "Fixture"], inner);
  f.git(["config", "user.email", "fixture@example.test"], inner);
  register(inner, {
    gitEntry: "screen",
    packagePath: "packages/prototype",
    repository: "https://example.test/team/frontend.git",
  });
  f.git(["add", "."], inner);
  f.git(["commit", "-m", "inner published catalog"], inner);
  f.git(["push", "origin", "HEAD:inner-publication"], inner);
  const b = f.git(["rev-parse", "HEAD"], inner);
  assert.throws(
    () => associate(f.author, { change: id }),
    /Commit the frontend catalog/,
  );
  f.childCommit();
  associate(f.author, { change: id });
  const source = JSON.parse(
    await readFile(
      join(f.author, `docs/project/changes/${id}/change.json`),
      "utf8",
    ),
  ).previews[0].artifact.source;
  assert.equal(source.submodulePath, "frontend/inner");
  assert.equal(source.catalogCommit, b);
  f.git(["add", "."]);
  const checked = spawnSync(process.execPath, [hook], {
    cwd: f.author,
    encoding: "utf8",
  });
  assert.equal(checked.status, 0, checked.stderr);
  f.commit();
  assert.equal(f.git(["rev-list", "--count", `${parent}..HEAD`]), "1");
  await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const result = await f.store.preview(
    f.project,
    id,
    undefined,
    DEFAULT_LIMITS,
    undefined,
    "screen",
  );
  assert.equal(
    result.descriptor.entries[0].sourceAvailable,
    true,
    result.descriptor.entries[0].sourceMessage,
  );
  assert.equal(result.descriptor.entries[0].source!.links.length, 2);
});
