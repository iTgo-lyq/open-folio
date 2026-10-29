import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
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
import { inspectMarkdown } from "../src/lib/markdown.ts";

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

test("hosted Change sharing generates missing screenshots and preserves supplied images", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const state = JSON.parse(
    f.g.git(["show", "HEAD:docs/project/changes/shared/change.json"]),
  );
  state.previews = [
    {
      id: "screen",
      title: "Hosted",
      kind: "page",
      devices: ["pc-web", "mobile"],
      artifact: {
        type: "hosted",
        version: "v1",
        url: "https://static.example.test/screen.html",
        digest: "sha256:" + "a".repeat(64),
        sourceCommit: f.g.git(["rev-parse", "HEAD"]),
        thumbnails: [
          { device: "mobile", url: "https://static.example.test/cover.png" },
        ],
      },
    },
  ];
  await f.g.put(
    "docs/project/changes/shared/change.json",
    JSON.stringify(state),
  );
  f.g.commit();
  await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const detail = await (await f.read()).json();
  const suffix = `?snapshot=${detail.snapshotId}`;
  const previews = await (await f.read("shared", "previews" + suffix)).json();
  const entry = previews.entries[0];
  assert.equal(entry.url, state.previews[0].artifact.url);
  assert.match(entry.thumbnails[0].url, /pc-web\.jpg/);
  assert.equal(
    entry.thumbnails[1].url,
    state.previews[0].artifact.thumbnails[0].url,
  );
  const generated = await f.read(
    "shared",
    "previews/screen/pc-web.jpg" + suffix,
  );
  assert.equal(generated.status, 200);
  assert.equal(generated.headers.get("content-type"), "image/jpeg");
  assert.equal(
    (await f.read("shared", "previews/screen/mobile.jpg" + suffix)).status,
    302,
  );
  assert.equal(
    (await f.read("shared", "previews/screen/ipad.jpg" + suffix)).status,
    404,
  );
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

test("cached shares return during a coalesced private and anonymous refresh", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  assert.equal((await f.read()).status, 200);
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
  const first = f.read("shared", "change?refresh=1");
  await begun;
  // This would deadlock if cached reads still joined the remote refresh.
  assert.equal((await f.read()).status, 200);
  assert.equal((await f.read("shared", "change?refresh=0")).status, 400);
  const second = f.read("private", "change?refresh=1"),
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

test("a Change absent from a cached repository is refreshed before declaring it missing", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  assert.equal((await f.read()).status, 200);
  await f.g.put(
    "docs/project/changes/new-change/change.json",
    JSON.stringify({
      schemaVersion: 1,
      id: "new-change",
      title: "new",
      size: "small",
      status: "active",
      stage: "requirement",
      branch: "develop",
      confirmations: {},
      tasks: {},
      closure: {},
    }),
  );
  f.g.commit();
  await f.readPrivate((ctx) =>
    rm(join(ctx.store.directory(), "last-checked.json"), { force: true }),
  );
  const response = await f.read("new-change");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).change.id, "new-change");
});

test("Agent text bundles authoritative originals and rewrites scoped links without changing code", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const state = JSON.parse(
    f.g.git(["show", "HEAD:docs/project/changes/shared/change.json"]),
  );
  state.clarifications = {
    Q1: {
      round: 1,
      question: "合作范围？",
      recommendation: "仅此 Change",
      answer: "按推荐",
    },
    Q2: { round: 1, question: "尚未回答？", recommendation: "继续讨论" },
  };
  state.tasks = { T1: { title: "交付协作", status: "todo" } };
  await f.g.put(
    "docs/project/changes/shared/change.json",
    JSON.stringify(state),
  );
  const code = "```md\n[代码示例](technical.md)\n```";
  await f.g.put(
    "docs/project/changes/shared/requirement.md",
    `# 原始需求\n\nunique-requirement-body[^1]\n\n[^1]: requirement-footnote\n\n[方案](technical.md#设计 "保留标题")\n\n[空格](<notes/a b.md>)\n\n![图](assets/image.png)\n\n[引用][tech]\n\n[tech]: technical.md "引用标题"\n\n[外链](https://example.org/doc)\n\n[范围外](../private/requirement.md)\n\n${code}\n`,
  );
  await f.g.put(
    "docs/project/changes/shared/technical.md",
    "# 设计\n\nunique-technical-body[^1]\n\n[^1]: technical-footnote\n\n[Second][tech]\n\n[tech]: research.md\n",
  );
  await f.g.put("docs/project/changes/shared/research.md", "# 调查证据");
  await f.g.put("docs/project/changes/shared/notes/a b.md", "# 空格路径");
  f.g.commit();
  const detail = (await (await f.read()).json()) as SharedChange;
  const response = await f.read("shared", "agent");
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/plain; charset=utf-8",
  );
  for (const [key, value] of [
    ["cache-control", "no-store"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["x-robots-tag", "noindex, nofollow"],
  ])
    assert.equal(response.headers.get(key), value);
  const body = await response.text();
  for (const text of [
    "unique-requirement-body",
    "unique-technical-body",
    "合作范围？",
    "尚未回答？",
    "交付协作",
    detail.snapshotId,
    detail.capturedAt,
    code,
    '"保留标题"',
    '"引用标题"',
  ])
    assert.ok(body.includes(text), text);
  assert.doesNotMatch(body, /private body|uploadUrl/);
  assert.ok(
    body.indexOf("## 文件：requirement.md") <
      body.indexOf("## 文件：technical.md"),
  );
  const links = inspectMarkdown(body).links.map((l) => l.url);
  const tree = inspectMarkdown(body).tree;
  const referenceNodes: { identifier: string; label: string }[] = [];
  const definitions = new Map<string, string>();
  const footnotes: string[] = [];
  const footnoteDefinitions: string[] = [];
  function visit(node: {
    type: string;
    identifier?: string;
    url?: string;
    value?: string;
    children?: any[];
  }) {
    if (node.type === "footnoteReference") footnotes.push(node.identifier!);
    if (node.type === "footnoteDefinition")
      footnoteDefinitions.push(node.identifier!);
    if (node.type === "linkReference")
      referenceNodes.push({
        identifier: node.identifier!,
        label: node.children!.map((c: any) => c.value).join(""),
      });
    if (node.type === "definition")
      definitions.set(node.identifier!, node.url!);
    node.children?.forEach(visit);
  }
  visit(tree);
  assert.equal(new Set(footnotes).size, 2);
  assert.deepEqual([...footnotes].sort(), [...footnoteDefinitions].sort());
  assert.equal(
    new URL(
      definitions.get(
        referenceNodes.find((n) => n.label === "Second")!.identifier,
      )!,
    ).searchParams.get("document"),
    "research.md",
  );
  assert.ok(links.includes("https://example.org/doc"));
  assert.ok(links.includes("#share-reference-unavailable"));
  const scoped = links.filter((url) =>
    url.startsWith("https://folio.test/share/agent?"),
  );
  const technical = new URL(
    scoped.find(
      (url) => new URL(url).searchParams.get("document") === "technical.md",
    )!,
  );
  assert.equal(technical.searchParams.get("snapshot"), detail.snapshotId);
  assert.ok(
    scoped.some(
      (url) => new URL(url).searchParams.get("document") === "notes/a b.md",
    ),
  );
  const single = await f.read(
    "shared",
    `agent?document=technical.md&snapshot=${detail.snapshotId}`,
  );
  const singleBody = await single.text();
  assert.match(singleBody, /unique-technical-body/);
  assert.doesNotMatch(singleBody, /unique-requirement-body/);
  const asset = links.find((url) => url.includes("/assets/"))!;
  assert.equal(new URL(asset).searchParams.get("snapshot"), detail.snapshotId);
  assert.ok(
    links.some(
      (url) =>
        url.includes("/previews/screen/index.html") &&
        new URL(url).searchParams.get("snapshot") === detail.snapshotId,
    ),
  );
  assert.equal(await (await f.read("shared", "agent", "HEAD")).text(), "");
});

test("Agent absolute links use the public Host and protocol behind Next's internal listener", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const response = await sharedResponse(
    new Request(
      `http://127.0.0.1:11117${sharedReadUrl({ repository: f.repo.webUrl, change: "shared", integrationBranch: "develop" }, "agent")}`,
      {
        headers: {
          host: "folio.example.org",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "untrusted.example.org",
        },
      },
    ),
    ["agent"],
    f.service,
    DEFAULT_LIMITS,
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /https:\/\/folio.example.org\/share\/agent\?/);
  assert.doesNotMatch(body, /127\.0\.0\.1|untrusted.example.org/);
});

test("Agent relative document links keep the same Change scope after archive", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const directory = "docs/project/archive/2026-10-29-shared";
  const state = JSON.parse(
    f.g.git(["show", "HEAD:docs/project/changes/shared/change.json"]),
  );
  const at = new Date().toISOString();
  Object.assign(state, {
    status: "completed",
    stage: "close",
    closure: {
      verification: { result: "passed", at, summary: "checked" },
      acceptance: { result: "accepted", at, summary: "accepted" },
      specs: { result: "not_needed", at, summary: "checked" },
      archive: { result: "done", at, summary: "archived", path: directory },
    },
  });
  await f.g.put(`${directory}/change.json`, JSON.stringify(state));
  await f.g.put(
    `${directory}/requirement.md`,
    "# archived-original\n\n[相对](../shared/technical.md)\n\n[绝对](/docs/project/changes/shared/technical.md)\n\n[其他](/docs/project/changes/private/requirement.md)\n",
  );
  await f.g.put(`${directory}/technical.md`, "# archived-technical");
  f.g.git(["rm", "-r", "docs/project/changes/shared"]);
  f.g.commit();
  const response = await f.read("shared", "agent?document=requirement.md");
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /archived-original/);
  const links = inspectMarkdown(body).links;
  const aliases = links.filter(
    (l) =>
      l.url.startsWith("https://folio.test/share/agent?") &&
      new URL(l.url).searchParams.get("document") === "technical.md",
  );
  assert.equal(aliases.length, 3); // directory plus both original references
  assert.ok(links.some((l) => l.url === "#share-reference-unavailable"));
  assert.doesNotMatch(body, /private body/);
});

test("Agent hosted prototype references preserve parentheses in the artifact URL", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const state = JSON.parse(
    f.g.git(["show", "HEAD:docs/project/changes/shared/change.json"]),
  );
  state.previews[0].artifact = {
    type: "hosted",
    version: "v1",
    url: "https://static.example.org/v1/demo)screen/index.html",
    sourceCommit: f.g.git(["rev-parse", "HEAD"]),
    digest: "sha256:" + "a".repeat(64),
  };
  await f.g.put(
    "docs/project/changes/shared/change.json",
    JSON.stringify(state),
  );
  f.g.commit();
  const body = await (await f.read("shared", "agent")).text();
  assert.ok(
    inspectMarkdown(body).links.some(
      (l) => l.url === "https://static.example.org/v1/demo%29screen/index.html",
    ),
  );
});

test("Agent text returns an explicit directory for large bundles and a complete single original", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const original = "# large-original\n" + "完整材料\n".repeat(45_000);
  await f.g.put("docs/project/changes/shared/requirement.md", original);
  f.g.commit();
  const response = await f.read("shared", "agent");
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(
    /超过 512 KiB.*未包含任何材料正文/.test(body),
    "large bundle must explicitly omit originals",
  );
  assert.doesNotMatch(body, /# large-original/);
  assert.match(body, /document=requirement.md/);
  const single = await f.read("shared", "agent?document=requirement.md");
  assert.equal(single.status, 200);
  assert.ok((await single.text()).includes(original));
});

test("Agent errors stay text and reject traversal, duplicate parameters and stale snapshots", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  for (const path of [
    "agent?document=../private/requirement.md",
    "agent?document=docs/project/changes/private/requirement.md",
    "agent?document=",
    "agent?document=assets/image.png",
    "agent?document=requirement.md&document=technical.md",
    "agent?branch=private",
    "agent?refresh=0",
    "agent?snapshot=old",
  ]) {
    const response = await f.read("shared", path);
    assert.ok(response.status >= 400, path);
    assert.equal(
      response.headers.get("content-type"),
      "text/plain; charset=utf-8",
    );
    assert.doesNotMatch(
      await response.text(),
      /shared body|private body|<!doctype/i,
    );
  }
  assert.equal((await f.read("missing", "agent")).status, 404);
  assert.equal((await f.read("shared", "agent", "POST")).status, 405);
  await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
  const denied = await f.read("shared", "agent");
  assert.equal(denied.status, 404);
  assert.doesNotMatch(await denied.text(), /shared body/);
});

for (const interruption of ["snapshot", "unbind"] as const) {
  test(`Agent bundle ${interruption} during body assembly prevents stale delivery`, async (t) => {
    const f = await setup();
    t.after(f.cleanup);
    await f.read();
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
    const pending = f.read("shared", "agent");
    await begun;
    try {
      if (interruption === "snapshot") {
        await f.g.put(
          "docs/project/changes/shared/requirement.md",
          "# Changed during Agent read",
        );
        f.g.commit();
        await f.readPrivate((ctx) => ctx.refresh(DEFAULT_LIMITS));
      } else await f.f.sessions.unbind(f.c.cookie, f.c.connection.id);
    } finally {
      release();
    }
    const response = await pending;
    assert.equal(response.status, interruption === "snapshot" ? 409 : 404);
    assert.doesNotMatch(await response.text(), /shared body/);
  });
}
