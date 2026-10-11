import test from "node:test";
import assert from "node:assert/strict";
import { rm, rename, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, primaryRecord } from "../src/lib/model.ts";
const confirmedAt = "2026-10-03T01:50:00+08:00";
const workflow = {
  schemaVersion: 1,
  protectedBranches: ["main"],
  prototype: { status: "enabled", packagePath: "packages/prototype" },
};
const entry = {
  id: "page",
  title: "页面",
  kind: "page",
  artifact: {
    type: "git",
    path: "packages/prototype/preview/page",
    sourceCommit: "a".repeat(40),
  },
  devices: ["pc-web", "mobile"],
};
const state = {
  schemaVersion: 1,
  id: "preview-demo",
  title: "原型场景",
  branch: "change/preview-demo",
  size: "small",
  status: "active",
  stage: "execution",
  confirmations: {},
  tasks: { T1: { title: "交付", status: "doing" } },
  closure: {},
  previews: [entry],
};
const changePath = "docs/project/changes/preview-demo/change.json";
const html = (text: string) =>
  `<!doctype html><html><head><meta charset=utf-8></head><body><h1>${text}</h1><script>window.mock={count:1}</script></body></html>`;
async function source() {
  const f = await fixture();
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  f.commit();
  f.git(["checkout", "-b", state.branch]);
  await f.put(changePath, JSON.stringify(state));
  await f.put(`${entry.artifact.path}/index.html`, html("first"));
  const revision = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  return { ...f, revision };
}
const preview = (
  f: Awaited<ReturnType<typeof source>>,
  revision?: string,
  limits = DEFAULT_LIMITS,
) =>
  f.store.preview(f.project, state.id, revision, limits, undefined, entry.id);

test("previews use pushed immutable commits, retain historical reads beyond document cache, and honor current baseline disable", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const initial = await preview(f);
  assert.equal(initial.descriptor.revision, f.revision);
  assert.match(initial.html!, /first/);
  await f.put(`${entry.artifact.path}/index.html`, html("not pushed"));
  const next = f.commit(false);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match((await preview(f)).html!, /first/);
  f.git(["push"]);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await preview(f)).descriptor.revision, next);
  for (let i = 0; i < 4; i++) await f.store.refresh(f.project, DEFAULT_LIMITS);
  const cold = f.makeStore();
  assert.match(
    (
      await cold.preview(
        f.project,
        state.id,
        f.revision,
        DEFAULT_LIMITS,
        undefined,
        entry.id,
      )
    ).html!,
    /first/,
  );
  f.git(["checkout", "main"]);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      ...workflow,
      prototype: { status: "disabled" },
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const disabled = await preview(f, f.revision);
  assert.equal(disabled.html, undefined);
  assert.equal(disabled.descriptor.policy.status, "disabled");
});

test("archive with obsolete workflow preserves HTML using current main config after branch deletion and cold rebuild; missing or rewritten tags never fall back", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const directory = "docs/project/archive/2026-10-03-preview-demo",
    at = confirmedAt,
    step = (result: string) => ({ at, summary: "已验证", result });
  await mkdir(join(f.author, "docs/project/archive"), { recursive: true });
  await rename(
    join(f.author, "docs/project/changes/preview-demo"),
    join(f.author, directory),
  );
  await f.put(
    `${directory}/change.json`,
    JSON.stringify({
      ...state,
      status: "completed",
      stage: "close",
      tasks: { T1: { title: "交付", status: "done" } },
      closure: {
        verification: step("passed"),
        acceptance: step("accepted"),
        specs: step("not_needed"),
        archive: { ...step("done"), path: directory },
      },
    }),
  );
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      ...workflow,
      prototype: {
        ...workflow.prototype,
        decision: { at, summary: "历史决定" },
      },
    }),
  );
  const archived = f.commit(),
    tag = "spec-trail/archive-v2/preview-demo";
  f.git(["tag", tag, archived]);
  f.git(["push", "origin", `refs/tags/${tag}`]);
  f.git(["push", "origin", "--delete", state.branch]);
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const group = (await f.store.snapshot(f.project)).changes.find(
    (g) => g.id === state.id,
  )!;
  assert(primaryRecord(group)?.archived);
  let result = await preview(f);
  assert(result.descriptor.pinned);
  assert.equal(result.descriptor.revision, archived);
  assert.match(result.html!, /first/);
  await rm(join(f.root, "cache"), { recursive: true, force: true });
  const cold = f.makeStore();
  await cold.refresh(f.project, DEFAULT_LIMITS);
  assert.match(
    (
      await cold.preview(
        f.project,
        state.id,
        undefined,
        DEFAULT_LIMITS,
        undefined,
        entry.id,
      )
    ).html!,
    /first/,
  );
  await f.put(`${entry.artifact.path}/index.html`, html("rewritten"));
  const changed = f.commit(false);
  f.git(["tag", "-f", tag, changed]);
  f.git(["push", "--force", "origin", `refs/tags/${tag}`]);
  await cold.refresh(f.project, DEFAULT_LIMITS);
  result = await cold.preview(
    f.project,
    state.id,
    undefined,
    DEFAULT_LIMITS,
    undefined,
    entry.id,
  );
  assert.equal(result.html, undefined);
  assert.match(result.descriptor.message!, /改写/);
  f.git(["push", "origin", `:${"refs/tags/" + tag}`]);
  await cold.refresh(f.project, DEFAULT_LIMITS);
  result = await cold.preview(
    f.project,
    state.id,
    archived,
    DEFAULT_LIMITS,
    undefined,
    entry.id,
  );
  assert.equal(result.html, undefined);
  assert.match(result.descriptor.message!, /引用|版本/);
});

test("Change previews ignore historical workflow and fail on invalid current config, moved paths or legacy references", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  for (const oldWorkflow of [
    JSON.stringify({ ...workflow, prototype: { status: "disabled" } }),
    "{broken",
    null,
  ]) {
    if (oldWorkflow === null) f.git(["rm", "docs/project/workflow.json"]);
    else await f.put("docs/project/workflow.json", oldWorkflow);
    const revision = f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    assert.match((await preview(f)).html!, /first/);
    assert.match((await preview(f, revision)).html!, /first/);
  }
  const snapshot = await f.store.snapshot(f.project);
  f.git(["checkout", "main"]);
  await f.put("docs/project/workflow.json", "{broken");
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const invalid = await f.store.preview(
    f.project,
    state.id,
    f.revision,
    DEFAULT_LIMITS,
    snapshot.id,
    entry.id,
  );
  assert.equal(invalid.html, undefined);
  assert.equal(invalid.descriptor.failed, true);
  assert.equal(invalid.descriptor.policy.status, "invalid");
  assert.match(invalid.descriptor.message!, /workflow.json/);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      ...workflow,
      prototype: {
        ...workflow.prototype,
        packagePath: "packages/new-prototype",
      },
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const moved = await preview(f, f.revision);
  assert.equal(moved.html, undefined);
  assert.equal(moved.descriptor.entries[0].available, false);
  assert.match(moved.descriptor.entries[0].message!, /main 当前配置/);
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  f.commit();
  f.git(["checkout", state.branch]);
  const { artifact, ...legacy } = entry;
  await f.put(
    changePath,
    JSON.stringify({
      ...state,
      previews: [{ ...legacy, path: artifact.path }],
    }),
  );
  const legacyRevision = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const rejected = await preview(f, legacyRevision);
  assert.equal(rejected.html, undefined);
  assert.equal(rejected.descriptor.entries[0].available, false);
  assert.match(rejected.descriptor.entries[0].message!, /关联字段不合法/);
});

test("previews reject unreachable revisions, invalid entries, symlinks, LFS and resource limits without losing documents", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  await assert.rejects(preview(f, "../../etc/passwd"), {
    code: "INVALID_PARAMETER",
  });
  assert.equal((await preview(f, "0".repeat(40))).html, undefined);
  const limited = await preview(f, undefined, {
    ...DEFAULT_LIMITS,
    previewBytes: 2,
  });
  assert.equal(limited.html, undefined);
  assert.match(limited.descriptor.entries[0].message!, /大小/);
  assert((await f.store.snapshot(f.project)).specs.length);
  await rm(join(f.author, entry.artifact.path, "index.html"));
  await symlink(
    "/etc/passwd",
    join(f.author, entry.artifact.path, "index.html"),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await preview(f)).html, undefined);
  await rm(join(f.author, entry.artifact.path, "index.html"));
  await f.put(
    `${entry.artifact.path}/index.html`,
    "version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 200\n",
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match((await preview(f)).descriptor.entries[0].message!, /LFS/);
  await f.put(
    `${entry.artifact.path}/index.html`,
    '<!doctype html><script src="./chunk.js"></script>',
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match((await preview(f)).descriptor.entries[0].message!, /自包含/);
  await f.put(`${entry.artifact.path}/index.html`, html("valid"));
  await f.put(
    changePath,
    JSON.stringify({
      ...state,
      previews: [entry, { id: "broken", kind: "page", devices: [] }],
    }),
  );
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const partial = await preview(f);
  assert.match(partial.html!, /valid/);
  assert.equal(partial.descriptor.entries[1].available, false);
});

test("legacy archives without previews need no retention tag, including fixed revision links", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put("docs/project/workflow.json", JSON.stringify(workflow));
  const at = confirmedAt,
    step = (result: string) => ({ at, summary: "已验证", result });
  const directory = "docs/project/archive/2026-10-03-legacy";
  const legacy = {
    ...state,
    id: "legacy",
    branch: "main",
    status: "completed",
    stage: "close",
    previews: undefined,
    tasks: { T1: { title: "交付", status: "done" } },
    closure: {
      verification: step("passed"),
      acceptance: step("accepted"),
      specs: step("not_needed"),
      archive: { ...step("done"), path: directory },
    },
  };
  for (const previews of [undefined, []]) {
    await f.put(
      `${directory}/change.json`,
      JSON.stringify({ ...legacy, previews }),
    );
    const revision = f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS);
    for (const version of [undefined, revision]) {
      const result = await f.store.preview(
        f.project,
        "legacy",
        version,
        DEFAULT_LIMITS,
      );
      assert.equal(result.html, undefined);
      assert.match(result.descriptor.message!, /没有关联原型/);
    }
  }
});

test("two Changes can share one exported entry without a separate prototype manifest", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  f.git(["checkout", "-b", "change/shared-consumer"]);
  await f.put(
    "docs/project/changes/shared-consumer/change.json",
    JSON.stringify({
      ...state,
      id: "shared-consumer",
      branch: "change/shared-consumer",
    }),
  );
  const revision = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const original = await preview(f),
    reused = await f.store.preview(
      f.project,
      "shared-consumer",
      undefined,
      DEFAULT_LIMITS,
      undefined,
      entry.id,
    );
  assert.equal(reused.html, original.html);
  assert.equal(reused.descriptor.revision, revision);
  assert.deepEqual(
    reused.descriptor.entries[0].artifact,
    original.descriptor.entries[0].artifact,
  );
});

test("per-commit preview entry limits do not cap lifetime archive tags or block document refresh", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  for (const id of ["first-archive", "second-archive"]) {
    const directory = `docs/project/archive/2026-10-03-${id}`,
      at = confirmedAt;
    const step = (result: string) => ({ at, summary: "已验证", result });
    await f.put(
      `${directory}/change.json`,
      JSON.stringify({
        ...state,
        id,
        status: "completed",
        stage: "close",
        tasks: { T1: { title: "交付", status: "done" } },
        closure: {
          verification: step("passed"),
          acceptance: step("accepted"),
          specs: step("not_needed"),
          archive: { ...step("done"), path: directory },
        },
      }),
    );
    const revision = f.commit();
    const tag = `refs/tags/spec-trail/archive-v2/${id}`;
    f.git(["tag", tag.slice(10), revision]);
    f.git(["push", "origin", tag]);
  }
  const limits = { ...DEFAULT_LIMITS, previewEntries: 1 };
  const snapshot = await f.store.refresh(f.project, limits);
  assert.equal(snapshot.archiveRefs.length, 2);
  assert(snapshot.specs.length);
  assert.equal(snapshot.changes.length, 3);
  for (const id of ["first-archive", "second-archive"]) {
    const result = await f.store.preview(
      f.project,
      id,
      undefined,
      limits,
      undefined,
      entry.id,
    );
    assert.match(result.html!, /first/);
  }
});

test("archive pins treat constructor as an ordinary valid Change id across refresh and restart", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const id = "constructor",
    directory = `docs/project/archive/2026-10-03-${id}`,
    at = confirmedAt;
  const step = (result: string) => ({ at, summary: "已验证", result });
  await f.put(
    `${directory}/change.json`,
    JSON.stringify({
      ...state,
      id,
      status: "completed",
      stage: "close",
      tasks: { T1: { title: "交付", status: "done" } },
      closure: {
        verification: step("passed"),
        acceptance: step("accepted"),
        specs: step("not_needed"),
        archive: { ...step("done"), path: directory },
      },
    }),
  );
  const revision = f.commit(),
    tag = `refs/tags/spec-trail/archive-v2/${id}`;
  f.git(["tag", tag.slice(10), revision]);
  f.git(["push", "origin", tag]);
  for (const store of [f.store, f.makeStore()]) {
    const snapshot = await store.refresh(f.project, DEFAULT_LIMITS);
    assert(Object.hasOwn(snapshot.archivePins, `spec-trail/archive-v2/${id}`));
    assert.equal(snapshot.archivePins[`spec-trail/archive-v2/${id}`], revision);
    const result = await store.preview(
      f.project,
      id,
      undefined,
      DEFAULT_LIMITS,
      undefined,
      entry.id,
    );
    assert.match(result.html!, /first/);
  }
});

test("hosted Change references are fixed, accept any HTTP/HTTPS source, and do not require retained source commits", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const { artifact: ignored, ...base } = entry;
  const artifact = {
    type: "hosted",
    version: "v1",
    url: "http://preview.example.test/v1/index.html#orders",
    sourceCommit: f.revision,
    digest: "sha256:" + "a".repeat(64),
    thumbnails: [
      { device: "pc-web", url: "https://preview.example.test/v1/pc.png" },
    ],
  };
  await f.put(
    changePath,
    JSON.stringify({ ...state, previews: [{ ...base, artifact }] }),
  );
  const first = f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal((await preview(f)).descriptor.entries[0].available, true);
  const project = f.project;
  const read = (revision?: string) =>
    f.store.preview(project, state.id, revision, DEFAULT_LIMITS);
  const initial = await read();
  assert.equal(initial.html, undefined);
  assert.equal(initial.descriptor.entries[0].url, artifact.url);
  assert.equal(initial.descriptor.entries[0].sourceAvailable, true);
  await f.put(
    changePath,
    JSON.stringify({
      ...state,
      previews: [
        {
          ...base,
          artifact: {
            ...artifact,
            version: "v2",
            url: "https://preview.example.test/v2/index.html",
            sourceCommit: "0".repeat(40),
          },
        },
      ],
    }),
  );
  f.commit();
  await f.store.refresh(project, DEFAULT_LIMITS);
  assert.equal((await read()).descriptor.entries[0].sourceAvailable, false);
  assert.equal((await read(first)).descriptor.entries[0].url, artifact.url);
});

test("new Git fallback reads its Change-owned snapshot independently from current package output", async (t) => {
  const f = await source();
  t.after(f.cleanup);
  const { artifact: ignored, ...base } = entry;
  const path = "docs/project/changes/preview-demo/previews/page";
  await f.put(`${path}/index.html`, html("change snapshot"));
  await f.put(
    changePath,
    JSON.stringify({
      ...state,
      previews: [
        {
          ...base,
          artifact: {
            type: "git",
            path,
            sourceCommit: f.revision,
          },
        },
      ],
    }),
  );
  await f.put(`${entry.artifact.path}/index.html`, html("current output"));
  f.commit();
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.match((await preview(f)).html!, /change snapshot/);
});
