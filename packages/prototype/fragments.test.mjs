import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { api, readSession, resetMock } from "./src/mocks/api.ts";
import { memoryStorage } from "./src/browser.ts";
import { htmlIssues } from "../../.agents/skills/spec-trail/scripts/prototype/html.mjs";

test("seven manifest entries point at direct business component imports and standalone output", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("./prototype.json", import.meta.url), "utf8"),
  );
  const published = JSON.parse(
    await readFile(
      new URL("./publish-quiet-entries.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.entries.length, 7);
  assert.deepEqual(
    manifest.entries.map((entry) => entry.id).sort(),
    published.map((entry) => entry.id).sort(),
  );
  for (const entry of manifest.entries) {
    const source = await readFile(
      new URL(`../../${entry.sourcePath}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /from "\.\.\/\.\.\/\.\.\/\.\.\/src\/components\//);
    const html = await readFile(
      new URL(`./dist/${entry.id}/index.html`, import.meta.url),
      "utf8",
    );
    assert.deepEqual(htmlIssues(html), [], entry.id);
    assert.match(html, /prototype-root/);
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i);
  }
});

test("mock login and tokens only accept explicit fictional credentials", async () => {
  resetMock("login");
  await assert.rejects(
    api("/api/session", {
      method: "POST",
      body: JSON.stringify({ username: "real", password: "anything" }),
    }),
    { code: "INVALID_LOGIN" },
  );
  assert.equal(readSession().authenticated, false);
  await api("/api/session", {
    method: "POST",
    body: JSON.stringify({ username: "demo-lin", password: "demo12345" }),
  });
  assert.equal(readSession().authenticated, true);
  await assert.rejects(
    api("/api/connections", {
      method: "POST",
      body: JSON.stringify({ token: "not-demo" }),
    }),
    { code: "INVALID_TOKEN" },
  );
  await api("/api/connections", {
    method: "POST",
    body: JSON.stringify({ token: "demo", label: "演示新增" }),
  });
  assert.equal(readSession().connections.length, 2);
  resetMock("default");
  assert.equal(readSession().connections.length, 1);
});

test("view selection and saving work in memory with revision checks", async () => {
  resetMock("default");
  const before = await api("/mock/change-views");
  const next = await api("/mock/change-views", {
    method: "PUT",
    body: JSON.stringify({
      expectedRevision: before.revision,
      views: before.views.map((view) => ({ ...view, name: "演示视图" })),
    }),
  });
  assert.equal(next.revision, before.revision + 1);
  assert.equal(next.views[0].name, "演示视图");
  await assert.rejects(
    api("/mock/change-views", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: before.revision,
        views: before.views,
      }),
    }),
    { code: "VIEWS_CHANGED" },
  );
  resetMock("default");
  assert.equal(
    (await api("/mock/change-views")).views[0].name,
    before.views[0].name,
  );
});

test("bindings select the new Token and never reuse removed identifiers", async () => {
  resetMock("empty");
  const add = () =>
    api("/api/connections", {
      method: "POST",
      body: JSON.stringify({ token: "demo" }),
    });
  const first = await add();
  assert.equal(readSession().connected, true);
  assert.equal(readSession().workspace.id, first.connection.id);
  const second = await add();
  await api(`/api/connections/${first.connection.id}`, { method: "DELETE" });
  const third = await add();
  assert.notEqual(third.connection.id, second.connection.id);
  assert.equal(readSession().workspace.id, third.connection.id);
});

test("repository checks, share links and shared preview resources have local responses", async () => {
  resetMock("default");
  const repository = await api(
    "/api/connections/demo-token/repository-checks",
    {
      method: "POST",
      body: JSON.stringify({ url: "https://example.invalid/demo/atlas" }),
    },
  );
  assert.equal(repository.key, "atlas");
  const links = await api("/api/shared-changes/links?change=offline-map");
  assert.equal(links.web, "/share/demo-atlas");
  const preview = await api("/mock/previews/offline-map");
  assert.equal(preview.entries[0].url, preview.entries[0].artifact.url);
});

test("unknown, failed and aborted requests never fall through to a real backend", async () => {
  resetMock("default");
  await assert.rejects(api("https://example.invalid/api/session"), {
    code: "UNMOCKED_REQUEST",
  });
  await assert.rejects(api("/api/not-mocked"), { code: "UNMOCKED_REQUEST" });
  await assert.rejects(
    api("/mock/prototypes", { signal: AbortSignal.abort() }),
    { name: "AbortError" },
  );
  resetMock("error");
  await assert.rejects(api("/mock/prototypes"), { code: "MOCK_FAILED" });
  resetMock("empty");
  assert.deepEqual((await api("/mock/prototypes")).items, []);
});

test("browser storage remains isolated between instances", () => {
  const first = memoryStorage();
  const second = memoryStorage();
  first.setItem("theme", "dark");
  assert.equal(first.getItem("theme"), "dark");
  assert.equal(second.getItem("theme"), null);
  assert.equal(first.key(0), "theme");
  first.clear();
  assert.equal(first.length, 0);
});
