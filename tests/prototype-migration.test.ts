import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { validatePreviews } from "../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
test("legacy archive migration preserves original bytes and tags, rejects conflicts, and reads only the new retained format", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const at = "2026-10-01T00:00:00.000Z",
    step = (result: string) => ({ result, at, summary: "fixture" });
  const directory = "docs/project/archive/2026-10-01-demo";
  const entry = {
    id: "screen",
    title: "页面",
    kind: "page",
    devices: ["pc-web"],
    path: "packages/prototype/preview/screen",
  };
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
      },
    }),
  );
  const state = {
    schemaVersion: 1,
    id: "demo",
    title: "Demo",
    size: "small",
    status: "completed",
    stage: "close",
    branch: "change/demo",
    confirmations: {},
    tasks: { T1: { title: "done", status: "done" } },
    closure: {
      verification: step("passed"),
      acceptance: step("accepted"),
      specs: step("not_needed"),
      archive: { ...step("done"), path: directory },
    },
    previews: [entry],
  };
  await f.put(`${directory}/change.json`, JSON.stringify(state));
  const html = "<!doctype html><html><body>Original archive</body></html>";
  await f.put(`${entry.path}/index.html`, html);
  const original = f.commit();
  f.git(["tag", "spec-trail/archive/demo", original]);
  f.git(["push", "origin", "refs/tags/spec-trail/archive/demo"]);
  f.git(["checkout", "-b", "change/migrate"]);
  const run = (script: string, args: string[] = []) =>
    spawnSync(
      process.execPath,
      [
        resolve(`.agents/skills/spec-trail/prototype/scripts/${script}`),
        "--repo",
        f.author,
        "--change",
        "demo",
        ...args,
      ],
      { encoding: "utf8" },
    );
  await f.put(
    `${entry.path}/index.html`,
    "<!doctype html><html><body>New current</body></html>",
  );
  let result = run("migrate.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run("migrate.mjs").status, 0);
  const migrated = JSON.parse(
    await readFile(join(f.author, directory, "change.json"), "utf8"),
  );
  assert(!validatePreviews(migrated.previews).length);
  assert(validatePreviews([entry]).length);
  assert.equal(migrated.previews[0].artifact.sourceCommit, original);
  assert.equal(
    await readFile(
      join(f.author, directory, "previews/screen/index.html"),
      "utf8",
    ),
    html,
  );
  assert.deepEqual(migrated.closure, state.closure);
  const revision = f.commit();
  result = run("archive.mjs", ["--push"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git(["rev-parse", "spec-trail/archive/demo"]), original);
  assert.equal(f.git(["rev-parse", "spec-trail/archive-v2/demo"]), revision);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const preview = await f.store.preview(
    f.project,
    "demo",
    undefined,
    DEFAULT_LIMITS,
    undefined,
    "screen",
  );
  assert.equal(preview.html, html);
  assert.equal(preview.descriptor.revision, revision);
  assert.equal(
    (
      await f.store.preview(
        f.project,
        "demo",
        original,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      )
    ).html,
    undefined,
  );
  await f.put(
    `${directory}/previews/screen/index.html`,
    "different later bytes",
  );
  assert.equal(run("migrate.mjs").status, 1);
  assert.equal(
    await readFile(
      join(f.author, directory, "previews/screen/index.html"),
      "utf8",
    ),
    "different later bytes",
  );
});
