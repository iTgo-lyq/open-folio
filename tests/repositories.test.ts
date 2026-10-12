import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { personalFixture } from "./personal-fixture.ts";
import { fixture } from "./fixture.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";
import { Repositories } from "../src/server/repositories.ts";
import { Discovery, probeGit } from "../src/server/discovery.ts";
import { GitReader } from "../src/server/git.ts";
import { repositoryKey } from "../src/server/providers/types.ts";
import { repositoryResponse } from "../src/server/repository-api.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
async function setup(https = false) {
  const f = await personalFixture(),
    g = https ? await gitHttpsFixture() : await fixture();
  g.git(["branch", "-m", "trunk"]);
  await g.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["trunk"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
        hosting: { provider: "git" },
      },
    }),
  );
  await g.put(
    "packages/prototype/prototype.json",
    JSON.stringify({ schemaVersion: 1, entries: [] }),
  );
  await g.put(
    "docs/project/specs/platform/image.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  g.commit();
  g.git(["symbolic-ref", "HEAD", "refs/heads/trunk"], g.remote);
  const repo = f.repositories[0];
  if (https)
    repo.cloneUrl = (g as Awaited<ReturnType<typeof gitHttpsFixture>>).url;
  const discovery = new Discovery(join(f.root, "discovery"), f.sessions, f.git);
  const c = await f.connect("", https ? "token-a" : "first");
  await discovery.check(c.cookie, c.connection.id, repo.webUrl);
  const service = new Repositories(
    join(f.root, "repos"),
    f.sessions,
    discovery,
    https ? probeGit : f.git,
    https ? undefined : (dir) => new GitReader(dir, g.remote, "file"),
  );
  const key = repositoryKey(repo);
  const read = (fn: Parameters<Repositories["read"]>[3]) =>
    service.read(c.cookie, c.connection.id, key, fn);
  const request = (
    path: string,
    method = "GET",
    cookie = c.cookie,
    id = c.connection.id,
  ) =>
    repositoryResponse(
      new Request(
        `https://folio.test/api/repositories/${key}/${path}${path.includes("?") ? "&" : "?"}connectionId=${id}`,
        {
          method,
          headers: {
            cookie: `openfolio-session=${cookie}`,
            origin: "https://folio.test",
          },
        },
      ),
      key,
      path.split("?")[0].split("/"),
      service,
      DEFAULT_LIMITS,
    );
  return {
    f,
    g,
    c,
    repo,
    service,
    key,
    read,
    request,
    cleanup: async () => {
      await g.cleanup();
      await f.cleanup();
    },
  };
}
test("personal repository reads isolate snapshots and authorize every cached document, search, image and HEAD", async () => {
  const t = await setup();
  try {
    assert.equal((await t.request("refresh", "POST")).status, 200);
    const r = await t.request("workbench"),
      w = await r.json();
    assert.equal(w.defaultBranch, "trunk");
    assert.equal(w.prototype.branch, "trunk");
    assert.equal(
      w.currentPrototype.revision,
      w.branches.find((b: { name: string }) => b.name === "trunk").commit,
    );
    const doc = w.documents.find(
      (d: { path: string; branch: string }) =>
        d.path.endsWith("spec.md") && d.branch === "trunk",
    );
    const image = w.documents.find(
      (d: { path: string; branch: string }) =>
        d.path.endsWith("image.png") && d.branch === "trunk",
    );
    const paths = [
      `documents/${doc.id}?snapshot=${w.id}`,
      `search?snapshot=${w.id}&q=中心`,
      `assets/${image.id}?snapshot=${w.id}`,
      `workbench?snapshot=${w.id}`,
      "prototypes",
    ];
    for (const p of paths) assert.equal((await t.request(p)).status, 200, p);
    const other = await t.f.connect("", "second");
    assert.equal(
      (await t.request("workbench", "GET", other.cookie)).status,
      401,
    );
    await t.f.discovery.check(other.cookie, other.connection.id, t.repo.webUrl);
    assert.equal(
      (
        await t.request(
          `workbench?snapshot=${w.id}`,
          "GET",
          other.cookie,
          other.connection.id,
        )
      ).status,
      410,
    );
    assert.equal(
      (await t.request("refresh", "POST", other.cookie, other.connection.id))
        .status,
      200,
    );
    const own = await (
      await t.request("workbench", "GET", other.cookie, other.connection.id)
    ).json();
    assert.equal(
      own.branches.find((b: { name: string }) => b.name === "trunk").commit,
      doc.commit,
    );
    t.f.controls.deny.add("1");
    for (const path of paths)
      for (const method of ["GET", "HEAD"]) {
        const denied = await t.request(path, method);
        assert.equal(denied.status, 403);
        assert.ok(!(await denied.text()).includes("中心仓库内容"));
      }
    t.f.controls.deny.clear();
    t.f.controls.identityInvalid = true;
    assert.equal((await t.request(paths[0])).status, 401);
  } finally {
    await t.cleanup();
  }
});
test("read delivery rechecks remote permissions; failed refresh retains prior pointer and replacement invalidates cache", async () => {
  const t = await setup();
  try {
    const first = (await t.read((ctx) => ctx.refresh(DEFAULT_LIMITS))) as {
      id: string;
    };
    await assert.rejects(
      () =>
        t.read(async (ctx) => {
          const body = await ctx.store.workbench(ctx.project);
          t.f.controls.deny.add("1");
          return body;
        }),
      { code: "READ_DENIED" },
    );
    t.f.controls.deny.clear();
    await assert.rejects(
      () =>
        t.read(async (ctx) => {
          await ctx.store.refresh(ctx.project, DEFAULT_LIMITS, {
            signal: ctx.lease.context.signal,
            beforePublish: async () => {
              t.f.controls.deny.add("1");
              await ctx.assertRead();
            },
          });
        }),
      { code: "READ_DENIED" },
    );
    t.f.controls.deny.clear();
    assert.equal((await (await t.request("workbench")).json()).id, first.id);
    const lease = await t.f.sessions.lease(t.c.cookie, t.c.connection.id);
    const replacement = await t.f.sessions.connect(
      t.c.cookie,
      "sample",
      "updated",
      undefined,
      new AbortController().signal,
      t.c.connection.id,
    );
    assert.equal(lease.context.signal.aborted, true);
    lease.release();
    assert.equal(
      (await t.request("workbench", "GET", replacement.cookie)).status,
      404,
    );
  } finally {
    await t.cleanup();
  }
});
test("the complete personal HTTP read path uses the supplied HTTPS Git token and rejects revoked Git access even with cache", async () => {
  const t = await setup(true),
    g = t.g as Awaited<ReturnType<typeof gitHttpsFixture>>,
    saved = process.env.GIT_SSL_CAINFO;
  process.env.GIT_SSL_CAINFO = g.cert;
  try {
    assert.equal((await t.request("refresh", "POST")).status, 200);
    const w = await (await t.request("workbench")).json();
    assert.ok(w.specs.length);
    assert.ok(g.attempts.length > 3);
    assert.ok(g.attempts.every((v) => v === "reader:token-a"));
    g.allowed.delete("reader:token-a");
    assert.equal((await t.request(`workbench?snapshot=${w.id}`)).status, 503);
    const dump = await t
      .read(async (ctx) =>
        readFile(join(ctx.store.directory(ctx.project), "git/config"), "utf8"),
      )
      .catch(() => "");
    assert.ok(!String(dump).includes("token-a"));
  } finally {
    if (saved === undefined) delete process.env.GIT_SSL_CAINFO;
    else process.env.GIT_SSL_CAINFO = saved;
    await t.cleanup();
  }
});
