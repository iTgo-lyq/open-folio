import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { submoduleFixture } from "./submodule-fixture.ts";
import { personalFixture } from "./personal-fixture.ts";
import { Repositories } from "../src/server/repositories.ts";
import { GitReader } from "../src/server/git.ts";
import { repositoryKey } from "../src/server/providers/types.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
import { join } from "node:path";
import {
  moduleUrl,
  moduleAddress,
} from "../.agents/skills/spec-trail/prototype/scripts/source.mjs";
for (const directory of ["packages/prototype", ""])
  test(`submodule ${directory || "root"} catalog reads the recorded commit, never child HEAD`, async (t) => {
    const f = await submoduleFixture(directory);
    t.after(f.cleanup);
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    const snapshot = await f.store.snapshot(f.project);
    let catalog = await f.store.prototypes(f.project);
    assert.equal(catalog.items[0].title, "子仓库 A");
    assert.equal(catalog.items[0].source!.links[0].commit, f.a);
    assert.equal(catalog.items[0].sourcePath, `frontend/${f.entry.sourcePath}`);
    assert.match(
      (
        await f.store.currentPreview(
          f.project,
          f.revision,
          DEFAULT_LIMITS,
          undefined,
          "screen",
        )
      ).html!,
      /fixed A/,
    );
    await f.childPut(
      f.path("prototype.json"),
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ ...f.entry, title: "子仓库 B" }],
      }),
    );
    await f.childPut(
      f.path("preview/screen/index.html"),
      "<!doctype html><body>fixed B</body>",
    );
    const b = f.childCommit();
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.equal(
      (await f.store.prototypes(f.project)).items[0].title,
      "子仓库 A",
    );
    f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    catalog = await f.store.prototypes(f.project);
    assert.equal(catalog.items[0].title, "子仓库 B");
    assert.equal(catalog.items[0].source!.links[0].commit, b);
    assert.match(
      (
        await f.store.currentPreview(
          f.project,
          f.revision,
          DEFAULT_LIMITS,
          undefined,
          "screen",
        )
      ).html!,
      /fixed A/,
    );
    f.deny();
    assert.equal(
      (await f.store.prototypes(f.project, snapshot.id)).items.length,
      0,
    );
    assert.match((await f.store.prototypes(f.project)).message!, /无权/);
    assert.ok((await f.store.workbench(f.project)).documents.length > 0);
    f.allow();
    assert.equal((await f.store.prototypes(f.project)).items.length, 1);
  });
test("nested gitlinks are resolved only along the configured package path", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  f.childGit(["config", "-f", ".gitmodules", "submodule.inner.path", "inner"]);
  f.childGit([
    "config",
    "-f",
    ".gitmodules",
    "submodule.inner.url",
    "https://example.test/team/frontend.git",
  ]);
  f.childGit(["add", ".gitmodules"]);
  f.childGit(["update-index", "--add", "--cacheinfo", `160000,${f.a},inner`]);
  f.childGit(["commit", "-m", "nested source"]);
  f.childGit(["push", "origin", "HEAD"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
      prototype: {
        status: "enabled",
        packagePath: "frontend/inner/packages/prototype",
      },
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const catalog = await f.store.prototypes(f.project);
  assert.equal(catalog.items[0].source!.links.length, 2);
  assert.equal(
    catalog.items[0].sourcePath,
    "frontend/inner/packages/prototype/src/screen.html",
  );
  assert.match(
    (
      await f.store.currentPreview(
        f.project,
        undefined,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      )
    ).html!,
    /fixed A/,
  );
});
test("repository service authorizes child independently and blocks cached child data without denying parent documents", async (t) => {
  const g = await submoduleFixture(),
    f = await personalFixture();
  t.after(g.cleanup);
  t.after(f.cleanup);
  const parent = f.repositories[0],
    child = f.repositories[1];
  g.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.frontend.url",
    child.webUrl,
  ]);
  g.commit();
  const c = await f.connect();
  await f.discovery.check(c.cookie, c.connection.id, parent.webUrl);
  const transports: string[] = [];
  const original = f.provider.gitTransport;
  f.provider.gitTransport = async (ctx, repo) => {
    assert.equal(
      ctx.secret.use((value) => value),
      "first",
    );
    transports.push(repo.cloneUrl);
    return original(ctx, repo);
  };
  const service = new Repositories(
    join(f.root, "repos"),
    f.sessions,
    f.discovery,
    (dir, transport) =>
      new GitReader(
        dir,
        transport.url === child.cloneUrl ? g.remote : g.parentRemote,
        "file",
      ),
  );
  const read = <T>(fn: Parameters<Repositories["read"]>[3]) =>
    service.read(c.cookie, c.connection.id, repositoryKey(parent), fn);
  await read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const catalog = await read((ctx) => ctx.store.prototypes(ctx.project));
  assert.equal((catalog as { items: unknown[] }).items.length, 1);
  assert.ok(transports.includes(child.cloneUrl));
  f.controls.deny.add(child.repositoryId);
  repositoryPermissions(f.sessions).now = () =>
    Date.now() + PERMISSION_CHECK_MS;
  const blocked = await read((ctx) => ctx.store.prototypes(ctx.project));
  assert.equal((blocked as { items: unknown[] }).items.length, 0);
  assert.match((blocked as { message: string }).message, /无权/);
  const workbench = await read((ctx) => ctx.store.workbench(ctx.project));
  assert.ok((workbench as { documents: unknown[] }).documents.length);
  const before = transports.length;
  g.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.frontend.url",
    "https://attacker.test/steal.git",
  ]);
  g.commit();
  await read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  assert.equal(
    transports.slice(before).filter((url) => url.includes("attacker")).length,
    0,
  );
});
test("module addresses normalize Git-relative and SSH forms while rejecting credentials, helpers and duplicate mappings", () => {
  const base = "https://github.com/team/main.git";
  assert.equal(
    moduleUrl("../frontend.git", "git@github.com:team/main.git"),
    "https://github.com/team/frontend.git",
  );
  for (const address of [
    "../frontend.git",
    "git@github.com:team/frontend.git",
    "ssh://git@github.com/team/frontend.git",
  ])
    assert.equal(
      moduleUrl(address, base),
      "https://github.com/team/frontend.git",
    );
  for (const address of [
    "file:///tmp/repo",
    "/tmp/repo",
    "ext::touch",
    "https://token@github.com/team/front.git",
    "https://github.com/team/front.git?secret=x",
  ])
    assert.throws(() => moduleUrl(address, base));
  assert.throws(
    () =>
      moduleAddress(
        "submodule.a.path\nfrontend\0submodule.a.url\n../a\0submodule.b.path\nfrontend\0submodule.b.url\n../b\0",
        "frontend",
      ),
    /唯一/,
  );
});
test("invalid submodule mapping and unavailable fixed object are diagnosed instead of falling back", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  f.git(["update-index", "--cacheinfo", `160000,${"a".repeat(40)},frontend`]);
  f.git(["commit", "-m", "unavailable gitlink"]);
  f.git(["push", "origin", "HEAD"]);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match(
    (await f.store.prototypes(f.project)).message!,
    /指定版本.*不可获取/,
  );
  assert.ok(f.opened.every((item) => item.commit === "a".repeat(40)));
});
