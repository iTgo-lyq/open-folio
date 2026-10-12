import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";
import { repositoryFixture as setup } from "./repositories-fixture.ts";
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
test("short reads use entry authorization; subsequent reads detect revocation and failed refresh retains the prior pointer", async () => {
  const t = await setup();
  try {
    const first = (await t.read((ctx) => ctx.refresh(DEFAULT_LIMITS))) as {
      id: string;
    };
    const permitted = (await t.read(async (ctx) => {
      const body = await ctx.store.workbench(ctx.project);
      t.f.controls.deny.add("1");
      return body;
    })) as { id: string };
    assert.equal(permitted.id, first.id);
    assert.equal((await t.request("workbench")).status, 403);
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
      401,
    );
    assert.equal(
      (
        await t.request(
          "workbench",
          "GET",
          replacement.cookie,
          replacement.connection.id,
        )
      ).status,
      404,
    );
  } finally {
    await t.cleanup();
  }
});
test("Git refresh uses the supplied HTTPS token; cached API-authorized reads do not probe Git", async () => {
  const t = await setup(true),
    g = t.g as Awaited<ReturnType<typeof gitHttpsFixture>>,
    saved = process.env.GIT_SSL_CAINFO;
  process.env.GIT_SSL_CAINFO = g.cert;
  try {
    assert.equal((await t.request("refresh", "POST")).status, 200);
    const w = await (await t.request("workbench")).json();
    assert.ok(w.specs.length);
    assert.ok(g.attempts.length > 0);
    assert.ok(g.attempts.every((v) => v === "reader:token-a"));
    const attempts = g.attempts.length;
    g.allowed.delete("reader:token-a");
    assert.equal((await t.request(`workbench?snapshot=${w.id}`)).status, 200);
    assert.equal(g.attempts.length, attempts);
    assert.equal((await t.request("refresh", "POST")).status, 503);
    assert.equal((await (await t.request("workbench")).json()).id, w.id);
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

test("cached reads authorize once and still reject a device revoked while materializing the response", async () => {
  const t = await setup();
  try {
    await t.request("refresh", "POST");
    const calls = { identity: 0, resolve: 0, contents: 0 };
    const provider = t.f.provider;
    for (const [method, field] of [
      ["authenticate", "identity"],
      ["resolveRepository", "resolve"],
      ["assertRead", "contents"],
    ] as const) {
      const original = provider[method].bind(provider);
      // Each provider method has a different signature; only count and forward.
      (provider as any)[method] = (...args: any[]) => {
        calls[field]++;
        return (original as any)(...args);
      };
    }
    const gitCalls = t.f.controls.gitCalls;
    assert.equal((await t.request("workbench")).status, 200);
    assert.deepEqual(calls, { identity: 0, resolve: 1, contents: 1 });
    assert.equal(t.f.controls.gitCalls, gitCalls);
    await assert.rejects(() =>
      t.read(async (ctx) => {
        const value = await ctx.store.workbench(ctx.project);
        await t.f.sessions.remove(t.c.cookie);
        return value;
      }),
    );
  } finally {
    await t.cleanup();
  }
});

test("same-token devices reuse snapshots and directories while another token cannot reuse them", async () => {
  const t = await setup();
  try {
    await t.request("refresh", "POST");
    const first = await (await t.request("workbench")).json(),
      second = await t.f.connect();
    assert.equal(second.connection.id, t.c.connection.id);
    assert.equal(
      (
        await (
          await t.request(
            `workbench?snapshot=${first.id}`,
            "GET",
            second.cookie,
            second.connection.id,
          )
        ).json()
      ).id,
      first.id,
    );
    const ownPath = await t.read(async (ctx) =>
      ctx.store.directory(ctx.project),
    );
    const secondPath = await t.service.read(
      second.cookie,
      second.connection.id,
      t.key,
      async (ctx) => ctx.store.directory(ctx.project),
    );
    assert.equal(ownPath, secondPath);
    const different = await t.f.connect("", "third");
    await t.service.discoveries.check(
      different.cookie,
      different.connection.id,
      t.repo.webUrl,
    );
    assert.equal(
      (
        await t.request(
          `workbench?snapshot=${first.id}`,
          "GET",
          different.cookie,
          different.connection.id,
        )
      ).status,
      410,
    );
    await t.request(
      "refresh",
      "POST",
      different.cookie,
      different.connection.id,
    );
    const differentPath = await t.service.read(
      different.cookie,
      different.connection.id,
      t.key,
      async (ctx) => ctx.store.directory(ctx.project),
    );
    assert.notEqual(differentPath, ownPath);
    assert.ok(String(ownPath).includes(t.c.connection.id));
  } finally {
    await t.cleanup();
  }
});

test("concurrent refresh has one credential-owned Git job and never delivers to a revoked device", async () => {
  const t = await setup();
  let release!: () => void, entered!: () => void, secondEntered!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      entered = r;
    }),
    secondStarted = new Promise<void>((r) => {
      secondEntered = r;
    });
  let collects = 0;
  const { Repositories } = await import("../src/server/repositories.ts"),
    { GitReader } = await import("../src/server/git.ts");
  const service = new Repositories(
    t.service.root,
    t.f.sessions,
    t.service.discoveries,
    (directory) => {
      const reader = new GitReader(directory, t.g.remote, "file"),
        collect = reader.collect.bind(reader);
      reader.collect = async (limits, signal) => {
        collects++;
        entered();
        await gate;
        signal.throwIfAborted();
        return collect(limits, signal);
      };
      return reader;
    },
  );
  try {
    const other = await t.f.connect();
    const one = service.read(
      t.c.cookie,
      t.c.connection.id,
      t.key,
      async (ctx) => ctx.refresh(DEFAULT_LIMITS),
    );
    const rejected = assert.rejects(() => one);
    await started;
    const two = service.read(
      other.cookie,
      other.connection.id,
      t.key,
      async (ctx) => {
        secondEntered();
        return ctx.refresh(DEFAULT_LIMITS);
      },
    );
    await secondStarted;
    await t.f.sessions.remove(t.c.cookie);
    release();
    await rejected;
    const result = await two;
    assert.equal(collects, 1);
    assert.equal(
      (
        await (
          await t.request("workbench", "GET", other.cookie, other.connection.id)
        ).json()
      ).id,
      result.id,
    );
  } finally {
    release();
    await t.cleanup();
  }
});
