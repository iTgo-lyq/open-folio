import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { matchesPrototype } from "../src/lib/prototypes.ts";
const path = "packages/prototype/prototype.json";
const workflow = {
  schemaVersion: 1,
  protectedBranches: ["main"],
  prototype: {
    status: "enabled",
    packagePath: "packages/prototype",
  },
};
async function source() {
  const f = await fixture();
  const entry = {
    id: "screen",
    title: "共享页面",
    description: "深入管理设置",
    kind: "page" as const,
    sourcePath: "packages/prototype/src/screen.html",
    devices: ["pc-web" as const, "mobile" as const],
    artifact: {
      type: "git" as const,
      path: "packages/prototype/preview/screen",
      sourceCommit: f.git(["rev-parse", "HEAD"]),
    },
  };
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  await f.put(path, JSON.stringify({ schemaVersion: 1, entries: [entry] }));
  await f.put(
    `${entry.artifact.path}/index.html`,
    "<!doctype html><html><body>first</body></html>",
  );
  const revision = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  return { ...f, entry, revision };
}
test("main catalog needs no Change; branch edits, source changes, renames and deletion do not rewrite fixed versions", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  let catalog = await f.store.prototypes(f.project);
  assert.equal(catalog.items.length, 1);
  assert(matchesPrototype(catalog.items[0], "管理设置", "mobile"));
  assert(!matchesPrototype(catalog.items[0], "change", ""));
  f.git(["checkout", "-b", "change/development"]);
  await f.put(
    path,
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...f.entry, title: "分支版本" }],
    }),
  );
  const branchRevision = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(
    (await f.store.prototypes(f.project)).items[0].title,
    "共享页面",
  );
  const denied = await f.store.currentPreview(
    f.project,
    branchRevision,
    DEFAULT_LIMITS,
  );
  assert.match(denied.descriptor.message!, /默认分支/);
  f.git(["checkout", "main"]);
  await f.put(f.entry.sourcePath, "updated source without rebuild");
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.deepEqual(
    (await f.store.prototypes(f.project)).items[0].artifact,
    f.entry.artifact,
  );
  await f.put(
    path,
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...f.entry, title: "新名称" }],
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await f.store.prototypes(f.project)).items[0].id, "screen");
  await f.put(path, JSON.stringify({ schemaVersion: 1, entries: [] }));
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await f.store.prototypes(f.project)).items.length, 0);
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
    /first/,
  );
  await assert.rejects(
    f.store.currentPreview(f.project, "bad", DEFAULT_LIMITS),
    { code: "INVALID_PARAMETER" },
  );
});
test("current catalog diagnoses missing main/manifest and invalid entries without inventing Change inventory", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  await f.put(
    path,
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        f.entry,
        { ...f.entry, id: "broken", sourcePath: "../bad" },
        { ...f.entry, id: "draft", artifact: undefined },
      ],
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  let catalog = await f.store.prototypes(f.project);
  assert.equal(catalog.items.length, 2);
  assert.equal(catalog.issues.length, 1);
  const invalidEntry = await f.store.currentPreview(
    f.project,
    undefined,
    DEFAULT_LIMITS,
    undefined,
    "broken",
  );
  assert.equal(invalidEntry.html, undefined);
  assert.equal(invalidEntry.descriptor.failed, true);
  assert.match(invalidEntry.descriptor.message!, /第 2 项字段不合法/);
  const preview = await f.store.currentPreview(
    f.project,
    undefined,
    DEFAULT_LIMITS,
  );
  assert.match(
    preview.descriptor.entries.find((e) => e.id === "draft")!.message!,
    /尚未登记/,
  );
  for (const contents of [
    "{broken",
    JSON.stringify({ schemaVersion: 1, entries: [], unexpected: true }),
  ]) {
    await f.put(path, contents);
    f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    catalog = await f.store.prototypes(f.project);
    assert.equal(catalog.items.length, 0);
    assert(catalog.message);
  }
  f.git(["rm", path]);
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match((await f.store.prototypes(f.project)).message!, /尚未登记/);
  f.git(["checkout", "-b", "trunk"]);
  f.git(["push", "-u", "origin", "HEAD"]);
  f.git(["symbolic-ref", "HEAD", "refs/heads/trunk"], f.remote);
  f.git(["push", "origin", "--delete", "main"]);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await f.store.prototypes(f.project)).items.length, 0);
  assert.equal(
    (await f.store.snapshot(f.project)).currentPrototype.revision,
    f.git(["rev-parse", "trunk"]),
  );
});
test("fixed project links and old snapshots use current main config with original artifacts and explicit path failures", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const historical: { revision: string; snapshot: string }[] = [];
  for (const oldWorkflow of [
    JSON.stringify({
      ...workflow,
      prototype: { ...workflow.prototype, decision: { summary: "旧配置字段" } },
    }),
    "{broken",
  ]) {
    await f.put("docs/project/workflow.json", oldWorkflow);
    const revision = f.commit();
    const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
    historical.push({ revision, snapshot: snapshot.id });
  }
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  await f.put(
    `${f.entry.artifact.path}/index.html`,
    "<!doctype html><html><body>replacement</body></html>",
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  for (const old of historical) {
    for (const revision of [old.revision, undefined]) {
      const result = await f.store.currentPreview(
        f.project,
        revision,
        DEFAULT_LIMITS,
        old.snapshot,
        f.entry.id,
      );
      assert.equal(result.descriptor.revision, old.revision);
      assert.match(result.html!, /first/);
      assert.doesNotMatch(result.html!, /replacement/);
    }
  }
  const relocated = "packages/new-prototype";
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      ...workflow,
      prototype: { ...workflow.prototype, packagePath: relocated },
    }),
  );
  await f.put(
    `${relocated}/prototype.json`,
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          ...f.entry,
          sourcePath: `${relocated}/src/screen.html`,
          artifact: {
            ...f.entry.artifact,
            path: `${relocated}/preview/screen`,
          },
        },
      ],
    }),
  );
  await f.put(
    `${relocated}/preview/screen/index.html`,
    "<!doctype html><html><body>replacement</body></html>",
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const moved = await f.store.currentPreview(
    f.project,
    historical[0].revision,
    DEFAULT_LIMITS,
    undefined,
    f.entry.id,
  );
  assert.equal(moved.html, undefined);
  assert.equal(moved.descriptor.failed, true);
  assert.match(moved.descriptor.message!, /默认分支当前配置.*尚未登记/);
  await f.put("docs/project/workflow.json", "{broken");
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const invalid = await f.store.currentPreview(
    f.project,
    historical[0].revision,
    DEFAULT_LIMITS,
    undefined,
    f.entry.id,
  );
  assert.equal(invalid.html, undefined);
  assert.equal(invalid.descriptor.policy.status, "invalid");
});
test("v2 cache migration preserves previously observed archive pins across refresh", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const snapshot = await f.store.snapshot(f.project);
  const file = join(
    f.store.directory(f.project),
    "snapshots",
    `${snapshot.id}.json`,
  );
  const old = JSON.parse(await readFile(file, "utf8"));
  old.cacheSchemaVersion = 2;
  delete old.currentPrototype;
  old.archivePins = { historical: "a".repeat(40) };
  await writeFile(file, JSON.stringify(old));
  const cold = f.makeStore();
  const migrated = await cold.snapshot(f.project);
  assert.equal(migrated.archivePins.historical, "a".repeat(40));
  assert.match((await cold.prototypes(f.project)).message!, /重新读取/);
  await cold.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(
    (await cold.snapshot(f.project)).archivePins.historical,
    "a".repeat(40),
  );
  assert.equal((await cold.prototypes(f.project)).items.length, 1);
});
