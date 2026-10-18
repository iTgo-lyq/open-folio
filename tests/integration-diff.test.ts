import test from "node:test";
import assert from "node:assert/strict";
import { rename, symlink, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { integrationFixture, completedChange } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { repositoryFixture } from "./repositories-fixture.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";

test("whole integration diff includes all paths, renames, exact lines, binary and special files", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  await f.put("src/text.ts", "first\nsecond\n");
  await f.put("odd\tname\n.txt", "control filename\n");
  await f.put("binary.png", Buffer.from([0, 1, 2, 3]));
  await f.put("non-utf8.txt", Buffer.from([255, 254, 65]));
  await f.put(
    "lfs.bin",
    "version https://git-lfs.github.com/spec/v1\noid sha256:" +
      "a".repeat(64) +
      "\nsize 123\n",
  );
  await f.put("large.txt", "a".repeat(1024 * 1024 + 1));
  await f.put("many-lines.txt", "a\n".repeat(10001));
  await rename(
    join(f.author, "docs/project/specs/platform/spec.md"),
    join(f.author, "moved-spec.md"),
  );
  await symlink("/outside/private", join(f.author, "link"));
  await chmod(join(f.author, "docs/project/workflow.json"), 0o755);
  await writeFile(
    Buffer.concat([Buffer.from(f.author + "/raw-"), Buffer.from([255])]),
    "raw filename\n",
  );
  f.git(["update-index", "--add", "--cacheinfo", `160000,${f.base},module`]);
  f.commit();
  f.git(["update-index", "--add", "--cacheinfo", `160000,${f.base},module`]);
  f.git(["commit", "-m", "Add submodule reference"]);
  f.git(["push", "origin", f.branch]);
  const merge = f.merge();
  f.git(["push", "origin", "--delete", f.branch]);
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const reader = await f.store.integration(f.project, f.id, snapshot.id);
  const summary = await reader.summary(),
    page = await reader.files();
  assert.equal(summary.record.status, "found");
  assert.equal(summary.record.commit, merge);
  assert.equal(summary.stats?.total, page.total);
  assert.equal(page.next, null);
  assert.ok(page.files.some((file) => file.path.startsWith(f.archivePath)));
  const byPath = (path: string) => {
    const file = page.files.find((file) => file.path === path);
    assert.ok(file, path);
    return file;
  };
  const text = await reader.file(byPath("src/text.ts").id);
  assert.deepEqual(
    text.lines.filter((line) => line.kind === "add"),
    [
      { kind: "add", text: "first", new: 1 },
      { kind: "add", text: "second", new: 2 },
    ],
  );
  assert.equal(
    byPath("moved-spec.md").oldPath,
    "docs/project/specs/platform/spec.md",
  );
  assert.equal((await reader.file(byPath("moved-spec.md").id)).kind, "empty");
  assert.equal(byPath("binary.png").added, null);
  for (const [path, kind] of [
    ["binary.png", "binary"],
    ["non-utf8.txt", "non-utf8"],
    ["lfs.bin", "lfs"],
    ["large.txt", "limited"],
    ["many-lines.txt", "limited"],
    ["link", "symlink"],
    ["module", "submodule"],
    ["docs/project/workflow.json", "mode-only"],
  ])
    assert.equal((await reader.file(byPath(path).id)).kind, kind, path);
  assert.ok(byPath("odd\\u0009name\\u000a.txt"));
  const raw = page.files.find((file) =>
    file.path.startsWith("\\x72\\x61\\x77"),
  )!;
  assert.equal(
    (await reader.file(raw.id)).lines.find((line) => line.kind === "add")?.text,
    "raw filename",
  );
  await assert.rejects(reader.file("f".repeat(64)), {
    code: "DIFF_FILE_NOT_FOUND",
  });
});

test("file pagination binds cursors to the complete snapshot and commit pair", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  for (let n = 0; n < 105; n++) await f.put(`files/${n}.txt`, `${n}\n`);
  f.commit();
  f.merge();
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const reader = await f.store.integration(f.project, f.id, snapshot.id);
  const first = await reader.files();
  assert.equal(first.files.length, 100);
  assert.ok(first.next);
  const second = await reader.files(first.next);
  assert.equal(second.next, null);
  assert.equal(
    new Set([...first.files, ...second.files].map((file) => file.id)).size,
    first.total,
  );
  await assert.rejects(reader.files("100." + "0".repeat(64)), {
    code: "INVALID_PARAMETER",
  });
  await f.put("docs/project/specs/new/spec.md", "# new");
  f.commit();
  const updated = await f.store.refresh(f.project, DEFAULT_LIMITS);
  await assert.rejects(
    (await f.store.integration(f.project, f.id, updated.id)).files(first.next),
    { code: "INVALID_PARAMETER" },
  );
});

test("integration API requires snapshots, rechecks permissions and rejects foreign file IDs and selectors", async (t) => {
  const f = await repositoryFixture();
  t.after(f.cleanup);
  await f.g.register({ example: "change/example" });
  f.g.git(["checkout", "-b", "change/example"]);
  const record = completedChange("example");
  await f.g.put(
    `${record.closure.archive.path}/change.json`,
    JSON.stringify(record),
  );
  f.g.git(["rm", "docs/project/changes/example/change.json"]);
  await f.g.put("private-diff.txt", "private delivered content\n");
  f.g.commit();
  f.g.git(["checkout", "develop"]);
  f.g.git([
    "merge",
    "--no-ff",
    "change/example",
    "-m",
    "Deliver\n\nSpecTrail-Change: example",
  ]);
  f.g.git(["push", "origin", "develop"]);
  assert.equal((await f.request("refresh", "POST")).status, 200);
  const snapshot = await (await f.request("workbench")).json();
  const base = "changes/example/integration",
    query = `snapshot=${snapshot.id}`;
  assert.equal((await f.request(base)).status, 400);
  assert.equal((await f.request(`${base}?${query}&head=main`)).status, 400);
  assert.equal(
    (await f.request(`${base}/files?${query}&cursor=fake`)).status,
    400,
  );
  assert.equal(
    (await f.request(`${base}/files/${"f".repeat(64)}?${query}`)).status,
    404,
  );
  const summary = await f.request(`${base}?${query}`);
  assert.equal(summary.status, 200);
  assert.match(summary.headers.get("cache-control")!, /no-store/);
  const files = await (await f.request(`${base}/files?${query}`)).json();
  const file = files.files.find(
    (file: { path: string }) => file.path === "private-diff.txt",
  );
  const paths = [
    `${base}?${query}`,
    `${base}/files?${query}`,
    `${base}/files/${file.id}?${query}`,
  ];
  for (const path of paths) assert.equal((await f.request(path)).status, 200);
  const other = await f.f.connect("", "second");
  await f.f.discovery.check(other.cookie, other.connection.id, f.repo.webUrl);
  assert.equal(
    (await f.request(paths[0], "GET", other.cookie, other.connection.id))
      .status,
    410,
  );
  f.f.controls.deny.add("1");
  repositoryPermissions(f.f.sessions).now = () =>
    Date.now() + PERMISSION_CHECK_MS;
  for (const path of paths)
    for (const method of ["GET", "HEAD"]) {
      const denied = await f.request(path, method);
      assert.equal(denied.status, 403);
      assert.ok(!(await denied.text()).includes("private delivered content"));
    }
});
