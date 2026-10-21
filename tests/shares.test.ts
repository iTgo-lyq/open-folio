import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repositoryFixture } from "./repositories-fixture.ts";
import { sharedResponse } from "../src/server/share-api.ts";
import { sharedReadUrl } from "../src/lib/share-link.ts";
import { ProviderError } from "../src/server/providers/types.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import type { SharedChange } from "../src/lib/shared-change.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";

async function setup() {
  const f = await repositoryFixture();
  for (const id of ["shared", "private"]) {
    await f.g.put(
      `docs/project/changes/${id}/change.json`,
      JSON.stringify({
        schemaVersion: 1,
        id,
        title: id,
        size: "small",
        status: "active",
        stage: "requirement",
        branch: "develop",
        confirmations: {},
        tasks: {},
        closure: {},
        previews: [
          {
            id: "screen",
            title: "Screen",
            kind: "page",
            devices: ["mobile"],
            artifact: {
              type: "git",
              path: "packages/prototype/preview/screen",
              sourceCommit: f.g.git(["rev-parse", "HEAD"]),
            },
          },
        ],
      }),
    );
    await f.g.put(
      `docs/project/changes/${id}/requirement.md`,
      `# ${id}\n\n${id} body`,
    );
    await f.g.put(
      `docs/project/changes/${id}/assets/image.png`,
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
  await f.g.put(
    "packages/prototype/preview/screen/index.html",
    '<!doctype html><html><head><meta charset="utf-8"><title>Screen</title></head><body><h1>Shared prototype</h1></body></html>',
  );
  f.g.commit();
  const image = new ThumbnailCache(join(f.f.root, "thumbnails"), async () =>
    Buffer.from([255, 216, 255, 217]),
  );
  const read = (
    change = "shared",
    path = "change",
    method = "GET",
    repository = f.repo.webUrl,
  ) =>
    sharedResponse(
      new Request(
        `https://folio.test${sharedReadUrl({ repository, change, integrationBranch: "develop" }, path)}`,
        { method },
      ),
      path.split("?")[0].split("/"),
      f.service,
      DEFAULT_LIMITS,
      image,
    );
  return {
    ...f,
    readPrivate: f.read,
    readSnapshot: () =>
      f.service.read(f.c.cookie, f.c.connection.id, f.key, (ctx) =>
        ctx.store.snapshot(ctx.project),
      ),
    read,
  };
}

test("a direct anonymous target exposes only one Change and scopes every resource without creating a share", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const a = { id: "shared" };
  const response = await f.read(a.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = (await response.json()) as SharedChange;
  assert.equal(data.change.id, "shared");
  assert.ok(data.documents.every((d) => d.path.includes("/shared/")));
  assert.deepEqual(Object.keys(data).sort(), [
    "capturedAt",
    "change",
    "delivery",
    "documents",
    "projectName",
    "snapshotId",
  ]);
  assert.ok(!JSON.stringify(data).includes("uploadUrl"));
  const document = data.documents.find((d) => d.kind === "markdown")!;
  assert.match(
    (
      await (
        await f.read(
          a.id,
          `documents/${document.id}?snapshot=${data.snapshotId}`,
        )
      ).json()
    ).body,
    /shared body/,
  );
  const asset = data.documents.find((d) => d.kind === "image")!;
  assert.equal(
    (await f.read(a.id, `assets/${asset.id}?snapshot=${data.snapshotId}`))
      .status,
    200,
  );
  const snapshot = await f.readSnapshot();
  for (const doc of snapshot.documents.filter(
    (d) => !data.documents.some((s) => s.id === d.id),
  ))
    assert.equal(
      (await f.read(a.id, `documents/${doc.id}?snapshot=${data.snapshotId}`))
        .status,
      404,
    );
  for (const key of ["revision", "branch", "path", "head", "base"])
    assert.equal((await f.read(a.id, `change?${key}=private`)).status, 400);
  assert.equal(
    (await f.read(a.id, `documents/${document.id}?snapshot=old`)).status,
    409,
  );
  assert.equal(
    (await f.read(a.id, `integration?snapshot=${data.snapshotId}`)).status,
    200,
  );
  const preview = await (
    await f.read(a.id, `previews?snapshot=${data.snapshotId}`)
  ).json();
  assert.equal(preview.entries[0].available, true, JSON.stringify(preview));
  assert.match(
    preview.entries[0].url,
    /\/api\/shared-changes\/previews\/screen\/index.html/,
  );
  for (const name of ["index.html", "mobile.jpg"]) {
    const assetResponse = await f.read(
      a.id,
      `previews/screen/${name}?snapshot=${data.snapshotId}`,
    );
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("cache-control"), "no-store");
    assert.equal(
      (
        await f.read(
          a.id,
          `previews/screen/${name}?snapshot=${data.snapshotId}`,
          "HEAD",
        )
      ).status,
      200,
    );
  }
  assert.equal((await f.read(a.id, "change", "POST")).status, 405);
  const head = await f.read(a.id, "change", "HEAD");
  assert.equal(await head.text(), "");
  assert.equal((await f.read("missing")).status, 404);
  assert.equal((await f.read("private")).status, 200);
  assert.equal(
    (
      await f.read(
        "shared",
        "change",
        "GET",
        "https://sample.test/team/unknown",
      )
    ).status,
    404,
  );
  for (const url of [
    "https://evil.test/team/content",
    "http://sample.test/team/content",
    "https://x:y@sample.test/team/content",
    "https://sample.test/team/content?secret=x",
  ])
    assert.equal((await f.read("shared", "change", "GET", url)).status, 400);
});

test("device logout, live updates and rebinding preserve the target URL", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const before = (await (await f.read()).json()) as SharedChange;
  await f.g.put(
    "docs/project/changes/shared/requirement.md",
    "# 最新内容\n\nnew body",
  );
  f.g.commit();
  await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const after = (await (await f.read()).json()) as SharedChange;
  assert.notEqual(after.snapshotId, before.snapshotId);
  assert.equal(
    (
      await f.read(
        "shared",
        `documents/${before.documents[0].id}?snapshot=${before.snapshotId}`,
      )
    ).status,
    409,
  );
  await f.f.sessions.remove(f.c.cookie);
  assert.equal((await f.read()).status, 200);
  const again = await f.f.connect("", "first");
  await f.f.sessions.unbind(again.cookie, again.connection.id);
  assert.equal((await f.read()).status, 404);
  const rebound = await f.f.connect("", "first");
  await f.service.discoveries.check(
    rebound.cookie,
    rebound.connection.id,
    f.repo.webUrl,
  );
  assert.equal((await f.read()).status, 200);
});

test("the same URL uses another valid repository source and rejects old source snapshots", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const before = (await (await f.read()).json()) as SharedChange;
  const other = await f.f.connect("", "second");
  await f.service.discoveries.check(
    other.cookie,
    other.connection.id,
    f.repo.webUrl,
  );
  await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
  const after = (await (await f.read()).json()) as SharedChange;
  assert.equal(after.change.id, "shared");
  assert.notEqual(after.snapshotId, before.snapshotId);
  assert.equal(
    (
      await f.read(
        "shared",
        `documents/${before.documents[0].id}?snapshot=${before.snapshotId}`,
      )
    ).status,
    409,
  );
  await f.f.sessions.unbind(other.cookie, other.connection.id);
  assert.equal((await f.read()).status, 404);
});

test("permission TTL and explicit denial do not serve cached contents", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const data = (await (await f.read()).json()) as SharedChange;
  const doc = data.documents.find((d) => d.kind === "markdown")!;
  const checks = repositoryPermissions(f.f.sessions),
    now = Date.now();
  f.f.controls.deny.add(f.repo.repositoryId);
  assert.equal((await f.read()).status, 200);
  checks.now = () => now + PERMISSION_CHECK_MS + 1;
  assert.equal((await f.read()).status, 404);
  for (const method of ["GET", "HEAD"])
    assert.equal(
      (
        await f.read(
          "shared",
          `documents/${doc.id}?snapshot=${data.snapshotId}`,
          method,
        )
      ).status,
      404,
    );
});

test("an invalid source can fall back but network failures remain visible", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const other = await f.f.connect("", "second");
  await f.service.discoveries.check(
    other.cookie,
    other.connection.id,
    f.repo.webUrl,
  );
  const first = (await f.f.sessions.repositoryBindings()).sort((a, b) =>
    a.workspaceId.localeCompare(b.workspaceId),
  )[0];
  const original = f.f.provider.resolveRepository;
  t.mock.method(
    f.f.provider,
    "resolveRepository",
    async (...[ctx, selector]: Parameters<typeof original>) => {
      const secret = ctx.secret.use((value) => value);
      if (
        secret ===
        (first.workspaceId === f.c.connection.id ? "first" : "second")
      )
        throw new ProviderError("READ_DENIED", "test source lost", 403);
      return original(ctx, selector);
    },
  );
  assert.equal((await f.read()).status, 200);
  t.mock.method(f.f.provider, "resolveRepository", async () => {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "network details", 503);
  });
  const checks = repositoryPermissions(f.f.sessions),
    now = Date.now();
  checks.now = () => now + PERMISSION_CHECK_MS + 1;
  const response = await f.read();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /network details/);
});

test("branch ambiguity requires a selected known source; repository renaming is not a redirect", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const other = await f.f.connect("", "second");
  await f.service.discoveries.check(
    other.cookie,
    other.connection.id,
    f.repo.webUrl,
    "alternate",
  );
  const response = await sharedResponse(
    new Request(
      `https://folio.test${sharedReadUrl({ repository: f.repo.webUrl, change: "shared" }, "change")}`,
    ),
    ["change"],
    f.service,
    DEFAULT_LIMITS,
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "SHARE_BRANCH_REQUIRED");
  assert.equal((await f.read()).status, 200);
  f.repo.fullName = "team/renamed";
  const checks = repositoryPermissions(f.f.sessions),
    now = Date.now();
  checks.now = () => now + PERMISSION_CHECK_MS + 1;
  assert.equal((await f.read()).status, 404);
});

test("one in-flight refresh serves private and anonymous readers", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    begun = new Promise<void>((r) => (started = r));
  const original = SnapshotStore.prototype.refresh;
  const mock = t.mock.method(
    SnapshotStore.prototype,
    "refresh",
    async function (this: SnapshotStore, ...args: Parameters<typeof original>) {
      started();
      await gate;
      return original.apply(this, args);
    },
  );
  const first = f.read();
  await begun;
  const second = f.read("private"),
    privateRead = f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS, true));
  await new Promise((r) => setTimeout(r, 25));
  release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  await privateRead;
  assert.equal(mock.mock.callCount(), 1);
});

for (const interruption of ["snapshot", "unbind"] as const) {
  test(`${interruption} changes during a document read prevent stale delivery`, async (t) => {
    const f = await setup();
    t.after(f.cleanup);
    const data = (await (await f.read()).json()) as SharedChange;
    const doc = data.documents.find((d) => d.kind === "markdown")!;
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      begun = new Promise<void>((r) => (started = r));
    const original = SnapshotStore.prototype.document;
    t.mock.method(
      SnapshotStore.prototype,
      "document",
      async function (
        this: SnapshotStore,
        ...args: Parameters<typeof original>
      ) {
        const value = await original.apply(this, args);
        started();
        await gate;
        return value;
      },
    );
    const pending = f.read(
      "shared",
      `documents/${doc.id}?snapshot=${data.snapshotId}`,
    );
    await begun;
    if (interruption === "snapshot") {
      await f.g.put(
        "docs/project/changes/shared/requirement.md",
        "# Updated during read",
      );
      f.g.commit();
      await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
    } else await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
    release();
    const response = await pending;
    assert.equal(response.status, interruption === "snapshot" ? 409 : 404);
    assert.doesNotMatch(await response.text(), /shared body/);
  });
}

test("a corrupt discovery cache on another binding cannot disable a readable target", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const other = await f.f.connect("", "second");
  await f.service.discoveries.check(
    other.cookie,
    other.connection.id,
    f.repo.webUrl,
  );
  await writeFile(
    join(f.service.discoveries.root, other.connection.id, "state.json"),
    "{corrupt",
  );
  assert.equal((await f.read()).status, 200);
  await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
  assert.equal((await f.read()).status, 404);
});
