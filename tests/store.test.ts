import test from "node:test";
import assert from "node:assert/strict";
import { rename, symlink, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { resolveDocumentLink, inspectMarkdown } from "../src/lib/markdown.ts";

test("only pushed trees are visible, immutable snapshots survive restart and failed refresh", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const first = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(first.specBranch, "develop");
  assert.equal(first.specs.length, 1);
  await f.put("docs/project/specs/platform/spec.md", "# 未推送\n新内容");
  f.commit(false);
  await f.put("docs/project/specs/platform/spec.md", "# 未提交\n其他内容");
  const still = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(still.specs[0].title, "平台");
  f.git(["push"]);
  const pushed = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(pushed.specs[0].title, "未推送");
  const restart = f.makeStore();
  assert.equal((await restart.snapshot(f.project)).id, pushed.id);
  assert.match(
    (
      await restart.document(f.project, first.specs[0].documentId, first.id)
    ).body.toString(),
    /中心仓库内容/,
  );
  await rename(f.remote, `${f.remote}.offline`);
  await assert.rejects(restart.refresh(f.project, DEFAULT_LIMITS), {
    code: "GIT_READ_FAILED",
  });
  assert.equal((await restart.snapshot(f.project)).id, pushed.id);
  assert.match((await restart.summary(f.project)).lastError!, /读取失败/);
  await assert.rejects(restart.document(f.project, "unknown", pushed.id), {
    code: "DOCUMENT_NOT_FOUND",
  });
  await assert.rejects(restart.snapshot(f.project, "../../secrets"), {
    code: "INVALID_PARAMETER",
  });
});

test("refreshes coalesce, deleted and rewritten branches disappear, retention expires explicitly", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const a = f.store.refresh(f.project, DEFAULT_LIMITS),
    b = f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.strictEqual(a, b);
  const first = await a;
  f.git(["checkout", "-b", "change/nested"]);
  await f.put("docs/project/specs/child/spec.md", "# 子能力");
  await f.put(
    "docs/project/changes/nested/change.json",
    JSON.stringify({
      schemaVersion: 1,
      id: "nested",
      title: "Nested",
      branch: "change/nested",
      size: "small",
      status: "active",
      stage: "requirement",
      confirmations: {},
      tasks: {},
      closure: {},
    }),
  );
  f.commit();
  await f.register({ nested: "change/nested" });
  const second = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(second.branches.length, 2);
  f.git(["reset", "--hard", "main"]);
  f.git(["push", "--force", "origin", "change/nested"]);
  const third = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(
    third.specs.some((s) => s.id === "child"),
    false,
  );
  f.git(["push", "origin", "--delete", "change/nested"]);
  const fourth = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(fourth.branches.length, 1);
  await assert.rejects(f.store.snapshot(f.project, first.id), {
    code: "SNAPSHOT_EXPIRED",
  });
  assert.equal((await f.store.snapshot(f.project, second.id)).id, second.id);
  assert.equal(
    (
      await f.store.summary({
        ...f.project,
        id: "different-repository",
      })
    ).snapshotId,
    undefined,
  );
});

test("file limits and symlinks never read outside blobs; overall limit keeps current", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/specs/large/spec.md",
    "# 大文件\n" + "x".repeat(2000),
  );
  await symlink("/etc/passwd", join(f.author, "docs/project/linked.md"));
  await f.put("docs/project/unsafe.png", "<script>alert(1)</script>");
  f.commit();
  const s = await f.store.refresh(f.project, {
    ...DEFAULT_LIMITS,
    markdownBytes: 500,
  });
  assert.equal(
    s.documents.find((d) => d.path.endsWith("large/spec.md"))?.readable,
    false,
  );
  assert.equal(
    s.documents.find((d) => d.path.endsWith("linked.md"))?.readable,
    false,
  );
  assert.equal(
    s.documents.find((d) => d.path.endsWith("unsafe.png"))?.readable,
    false,
  );
  await assert.rejects(
    f.store.refresh(f.project, { ...DEFAULT_LIMITS, documents: 1 }),
    { code: "SOURCE_LIMIT" },
  );
  assert.equal((await f.store.snapshot(f.project)).id, s.id);
  await assert.rejects(
    f.store.document(
      f.project,
      s.documents.find((d) => d.path.endsWith("linked.md"))!.id,
      s.id,
    ),
    { code: "DOCUMENT_UNREADABLE" },
  );
});

test("Markdown headings and link boundaries handle Chinese and duplicate ids", () => {
  assert.deepEqual(
    inspectMarkdown("# 中文\n## *重复*\n## 重复\n## 重复-1").headings.map(
      (h) => h.id,
    ),
    ["中文", "重复", "重复-1", "重复-1-1"],
  );
  const from = "docs/project/specs/a/spec.md";
  assert.deepEqual(resolveDocumentLink(from, "../b/spec.md#标题"), {
    kind: "internal",
    path: "docs/project/specs/b/spec.md",
    hash: "标题",
  });
  for (const href of [
    "../../../../secret",
    "javascript:alert(1)",
    "//evil.test",
    "%252e%252e/x",
    "../%00x",
    "..\\x",
    "%ZZ",
  ])
    assert.equal(resolveDocumentLink(from, href).kind, "invalid");
});

test("reference style links retain their actual citation location", () => {
  assert.deepEqual(
    inspectMarkdown(
      "# Example\n[能力][cap]\n\n[cap]: ../../specs/platform/spec.md",
    ).links,
    [{ url: "../../specs/platform/spec.md", line: 2 }],
  );
});

test("unsupported snapshot schemas fail without rewriting stored bytes", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const path = join(f.store.directory(), "snapshots", `${snapshot.id}.json`);
  const original = JSON.stringify({ ...snapshot, cacheSchemaVersion: 0 });
  await writeFile(path, original);
  await assert.rejects(f.makeStore().snapshot(f.project), {
    code: "CACHE_INVALID",
  });
  assert.equal(await readFile(path, "utf8"), original);
  const rebuilt = await f.store.refresh(f.project, DEFAULT_LIMITS);
  assert.equal(rebuilt.cacheSchemaVersion, 9);
  assert.equal(rebuilt.specs[0].title, "平台");
});
