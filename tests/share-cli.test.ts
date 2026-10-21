import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getShareLink } from "../.agents/skills/spec-trail/scripts/share.mjs";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "folio-share-cli-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const directory = "docs/project/changes/example";
  await mkdir(join(root, directory), { recursive: true });
  git("init", "-b", "change/example");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", "git@github.com:acme/fixture.git");
  const requests: { path: string; cookie?: string; authorization?: string }[] =
    [];
  let mode = "ok";
  let previewBlob: string | undefined;
  const artifact: Record<string, string> = {
    type: "hosted",
    version: "v1",
    sourceCommit: "a".repeat(40),
    digest: `sha256:${"b".repeat(64)}`,
    url: "",
  };
  const primary = {
    key: "primary",
    branch: "change/example",
    commit: "a".repeat(40),
    directory,
  };
  const documents: {
    id: string;
    path: string;
    blob: string;
    branch: string;
    commit: string;
    kind: string;
    readable: boolean;
  }[] = [];
  const value = {
    projectName: "acme/fixture",
    snapshotId: "snapshot",
    change: { id: "example", primary: "primary", candidates: [primary] },
    documents,
  };
  const server = createServer((req, res) => {
    requests.push({
      path: req.url!,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    if (mode === "timeout") return;
    if (mode === "redirect") {
      res.writeHead(302, { location: "/login" }).end();
      return;
    }
    if (mode === "missing") {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    const path = new URL(req.url!, "http://localhost").pathname;
    if (mode === "oversize") {
      res.end(JSON.stringify("x".repeat(8 * 1024 * 1024)));
      return;
    }
    if (path === "/artifact" || path.endsWith("/index.html")) {
      if (mode === "empty-preview") {
        res.writeHead(204).end();
        return;
      }
      if (mode === "json-preview") {
        res.end('{"error":"login required"}');
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        mode === "login-preview"
          ? '<html><a href="https://passport.bytedance.com/login">Sign in</a></html>'
          : "<h1>Preview</h1>",
      );
      return;
    }
    if (path.endsWith("/change")) {
      if (mode === "new-change") {
        res
          .writeHead(404)
          .end(JSON.stringify({ error: { code: "SHARE_SOURCE_UNAVAILABLE" } }));
        return;
      }
      res.end(
        JSON.stringify(
          mode === "wrong" ? { ...value, projectName: "acme/other" } : value,
        ),
      );
      return;
    }
    if (path.endsWith("/previews")) {
      res.end(
        JSON.stringify({
          changeId: "example",
          entries: [
            {
              id: "screen",
              available: true,
              artifact:
                mode === "stale-preview"
                  ? { ...artifact, version: "old" }
                  : artifact,
              url:
                artifact.type === "git"
                  ? `${base}/api/shared-changes/previews/screen/index.html`
                  : artifact.url,
              blob: previewBlob,
            },
          ],
        }),
      );
      return;
    }
    const d = documents.find((d) => path.endsWith(`/${d.id}`));
    res.end(JSON.stringify({ document: d, body: "# 技术方案\n" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  artifact.url = `${base}/artifact`;
  const configure = async (url?: string) =>
    writeFile(
      join(root, "docs/project/workflow.json"),
      JSON.stringify({
        schemaVersion: 2,
        collaborationBranch: "develop",
        protectedBranches: ["main"],
        ...(url ? { openfolioUrl: url } : {}),
      }),
    );
  await configure(base);
  await writeFile(join(root, directory, "technical.md"), "# 技术方案\n");
  await writeFile(
    join(root, directory, "change.json"),
    JSON.stringify({
      id: "example",
      branch: primary.branch,
      previews: [{ id: "screen", artifact }],
    }),
  );
  git("add", ".");
  git("commit", "-m", "fixture");
  for (const [id, name, kind] of [
    ["doc", "technical.md", "markdown"],
    ["state", "change.json", "json"],
  ])
    documents.push({
      id,
      path: `${directory}/${name}`,
      blob: git("rev-parse", `HEAD:${directory}/${name}`),
      branch: primary.branch,
      commit: primary.commit,
      kind,
      readable: true,
    });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    git,
    documents,
    requests,
    configure,
    gitPreview: async () => {
      const path = `${directory}/previews/screen`;
      await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, path, "index.html"), "<h1>Git preview</h1>");
      for (const key of ["url", "version", "digest"]) delete artifact[key];
      Object.assign(artifact, { type: "git", path });
      await writeFile(
        join(root, directory, "change.json"),
        JSON.stringify({
          id: "example",
          previews: [{ id: "screen", artifact }],
        }),
      );
      git("add", ".");
      git("commit", "-m", "Git preview");
      previewBlob = git("rev-parse", `HEAD:${path}/index.html`);
      return join(root, path, "index.html");
    },
    setMode: (v: string) => {
      mode = v;
    },
    run: (extra = {}) =>
      getShareLink({ repo: root, change: "example", waitSeconds: 0, ...extra }),
  };
}

test("CLI verifies stable document, overview and prototype links without credentials", async (t) => {
  const f = await fixture(t);
  const a = await f.run({ document: "technical.md" }),
    b = await f.run({ document: "technical.md" });
  assert.equal(a.url, b.url);
  const url = new URL(a.url);
  assert.equal(url.pathname, "/share");
  assert.equal(
    url.searchParams.get("repository"),
    "https://github.com/acme/fixture",
  );
  assert.equal(url.searchParams.get("document"), "technical.md");
  assert.equal(url.searchParams.get("collaborationBranch"), "develop");
  assert.equal(
    new URL((await f.run({ preview: "screen" })).url).searchParams.get("ct"),
    "previews",
  );
  assert.equal(new URL((await f.run()).url).searchParams.get("ct"), "overview");
  assert.ok(f.requests.some((r) => r.path === "/artifact"));
  assert.ok(f.requests.every((r) => !r.cookie && !r.authorization));
});

test("CLI rejects missing configuration, invalid paths and uncommitted material", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ document: "../secret" }), /相对路径/);
  await writeFile(
    join(f.root, "docs/project/changes/example/technical.md"),
    "updated",
  );
  await assert.rejects(f.run({ document: "technical.md" }), /未提交/);
  await assert.rejects(
    f.run({
      repo: join(f.root, "docs/project/changes/example"),
      document: "technical.md",
    }),
    /未提交/,
  );
  await f.configure();
  await assert.rejects(f.run(), /尚未配置/);
  assert.equal(f.requests.length, 0);
});

test("CLI detects stale material, stale prototype and mismatched source", async (t) => {
  const f = await fixture(t);
  f.documents[0].blob = "0".repeat(40);
  await assert.rejects(f.run({ document: "technical.md" }), /尚未同步/);
  f.setMode("stale-preview");
  await assert.rejects(f.run({ preview: "screen" }), /尚未同步/);
  f.setMode("wrong");
  await assert.rejects(f.run(), /来源与目标不一致/);
});

test("CLI reports anonymous redirects, missing targets, timeouts and response limits", async (t) => {
  const f = await fixture(t);
  f.setMode("redirect");
  await assert.rejects(f.run(), /重定向/);
  assert.ok(f.requests.every((r) => !r.path.startsWith("/login")));
  f.setMode("missing");
  await assert.rejects(f.run(), /HTTP 404/);
  f.setMode("timeout");
  await assert.rejects(f.run({ timeoutMs: 80 }), /超时/);
  f.setMode("oversize");
  await assert.rejects(f.run(), /8 MiB/);
});

test("CLI retries only unsynced material within the configured waiting window", async (t) => {
  const f = await fixture(t),
    original = f.documents[0].blob;
  f.documents[0].blob = "0".repeat(40);
  setTimeout(() => {
    f.documents[0].blob = original;
  }, 60);
  const result = await f.run({ document: "technical.md", waitSeconds: 0.15 });
  assert.ok(result.url);
  assert.equal(
    f.requests.filter((r) => r.path.startsWith("/api/shared-changes/change?"))
      .length,
    2,
  );
});

test("CLI waits for a newly pushed Change to enter the shared snapshot", async (t) => {
  const f = await fixture(t);
  f.setMode("new-change");
  setTimeout(() => f.setMode("ok"), 80);
  assert.ok((await f.run({ waitSeconds: 0.2 })).url);
  assert.equal(
    f.requests.filter((r) => r.path.startsWith("/api/shared-changes/change?"))
      .length,
    2,
  );
});

test("CLI refuses empty, non-HTML and known platform login responses for prototypes", async (t) => {
  const f = await fixture(t);
  for (const mode of ["empty-preview", "json-preview", "login-preview"]) {
    f.setMode(mode);
    await assert.rejects(f.run({ preview: "screen" }), /空响应|HTML|登录页/);
  }
});

test("CLI checks actual Git prototype HTML even when the artifact reference is unchanged", async (t) => {
  const f = await fixture(t),
    html = await f.gitPreview();
  assert.ok((await f.run({ preview: "screen" })).url);
  await writeFile(html, "<h1>Updated prototype</h1>");
  await assert.rejects(f.run({ preview: "screen" }), /未提交/);
  f.git("add", ".");
  f.git("commit", "-m", "HTML only");
  await assert.rejects(f.run({ preview: "screen" }), /尚未同步/);
});
