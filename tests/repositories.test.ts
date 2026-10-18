import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";
import { repositoryFixture as setup } from "./repositories-fixture.ts";
import {
  repositoryPermissions,
  PERMISSION_CHECK_MS,
} from "../src/server/repository-permissions.ts";
test("personal repository reads isolate snapshots and expire cached permissions for documents, images and HEAD", async () => {
  const t = await setup();
  try {
    assert.equal((await t.request("refresh", "POST")).status, 200);
    const r = await t.request("workbench"),
      w = await r.json();
    assert.equal(w.defaultBranch, "trunk");
    assert.equal(w.prototype.branch, "develop");
    assert.equal(
      w.currentPrototype.revision,
      w.branches.find((b: { name: string }) => b.name === "develop").commit,
    );
    const doc = w.documents.find(
      (d: { path: string; branch: string }) =>
        d.path.endsWith("spec.md") && d.branch === "develop",
    );
    const image = w.documents.find(
      (d: { path: string; branch: string }) =>
        d.path.endsWith("image.png") && d.branch === "develop",
    );
    const paths = [
      `documents/${doc.id}?snapshot=${w.id}`,
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
      own.branches.find((b: { name: string }) => b.name === "develop").commit,
      doc.commit,
    );
    t.f.controls.deny.add("1");
    repositoryPermissions(t.f.sessions).now = () =>
      Date.now() + PERMISSION_CHECK_MS;
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
    assert.equal((await t.request("workbench")).status, 200);
    repositoryPermissions(t.f.sessions).now = () =>
      Date.now() + PERMISSION_CHECK_MS;
    assert.equal((await t.request("workbench")).status, 403);
    t.f.controls.deny.clear();
    await t.g.put("docs/project/specs/platform/spec.md", "# 待发布的新内容");
    t.g.commit();
    await assert.rejects(
      () =>
        t.read(async (ctx) => {
          await ctx.store.refresh(ctx.project, DEFAULT_LIMITS, {
            signal: ctx.lease.context.signal,
            beforePublish: async () => {
              t.f.controls.deny.add("1");
              await ctx.assertRead(true);
            },
          });
        }),
      { code: "READ_DENIED" },
    );
    t.f.controls.deny.clear();
    assert.equal((await (await t.request("workbench")).json()).id, first.id);
    const lease = await t.f.sessions.lease(t.c.cookie, t.c.connection.id);
    const replacement = await t.f.sessions.login(
      t.c.cookie,
      "sample",
      "updated",
      undefined,
      new AbortController().signal,
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

test("unchanged and changed refreshes reuse permissions until the next periodic check", async () => {
  const t = await setup();
  try {
    const first = await (await t.request("refresh", "POST")).json();
    let reads = 0;
    const original = t.f.provider.assertRead.bind(t.f.provider);
    t.f.provider.assertRead = async (...args) => {
      reads++;
      return original(...args);
    };
    assert.deepEqual(await (await t.request("refresh", "POST")).json(), first);
    assert.equal(reads, 0);
    reads = 0;
    await t.g.put("docs/project/specs/platform/spec.md", "# 新内容");
    t.g.commit();
    const changed = await (await t.request("refresh", "POST")).json();
    assert.notEqual(changed.snapshotId, first.snapshotId);
    assert.equal(reads, 0);
    t.f.controls.deny.add("1");
    repositoryPermissions(t.f.sessions).now = () =>
      Date.now() + PERMISSION_CHECK_MS;
    assert.equal((await t.request("refresh", "POST")).status, 403);
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
        readFile(join(ctx.store.directory(), "git/config"), "utf8"),
      )
      .catch(() => "");
    assert.ok(!String(dump).includes("token-a"));
    t.f.controls.deny.add("1");
    assert.equal((await t.request("refresh", "POST")).status, 403);
    assert.equal((await t.request("workbench")).status, 403);
  } finally {
    if (saved === undefined) delete process.env.GIT_SSL_CAINFO;
    else process.env.GIT_SSL_CAINFO = saved;
    await t.cleanup();
  }
});

test("list permissions are reused by repository reads and a confirmed denial prevents an in-flight response", async () => {
  const t = await setup();
  try {
    await t.service.discoveries.list(t.c.cookie, t.c.connection.id);
    let calls = 0;
    const original = t.f.provider.assertRead;
    t.f.provider.assertRead = async (...args) => {
      calls++;
      return original(...args);
    };
    await t.request("refresh", "POST");
    assert.equal((await t.request("workbench")).status, 200);
    assert.equal(calls, 0);
    await assert.rejects(
      t.read(async (ctx) => {
        const work = await ctx.store.workbench(ctx.project);
        t.f.controls.deny.add("1");
        await assert.rejects(
          t.read((inner) => inner.assertRead(true)),
          { code: "READ_DENIED" },
        );
        return work;
      }),
      { code: "READ_DENIED" },
    );
  } finally {
    await t.cleanup();
  }
});

test("cached reads skip remote checks and still reject a device revoked while materializing the response", async () => {
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
    assert.deepEqual(calls, { identity: 0, resolve: 0, contents: 0 });
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
    const ownPath = await t.read(async (ctx) => ctx.store.directory());
    const secondPath = await t.service.read(
      second.cookie,
      second.connection.id,
      t.key,
      async (ctx) => ctx.store.directory(),
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
      async (ctx) => ctx.store.directory(),
    );
    assert.notEqual(differentPath, ownPath);
    assert.ok(String(ownPath).includes(t.c.connection.id));
  } finally {
    await t.cleanup();
  }
});
test("the final HTTP check rejects old workbench content after a switch using the same browser Cookie", async () => {
  const t = await setup();
  try {
    await t.request("refresh", "POST");
    const get = t.f.sessions.get.bind(t.f.sessions);
    let calls = 0;
    t.f.sessions.get = async (cookie) => {
      if (++calls === 2) await t.f.connect(t.c.cookie, "third");
      return get(cookie);
    };
    const response = await t.request("workbench");
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "SESSION_CHANGED");
    assert.equal(body.documents, undefined);
  } finally {
    await t.cleanup();
  }
});

for (const cached of [false, true])
  test(`concurrent refresh (cached=${cached}) has one credential-owned Git job and never delivers to a revoked device`, async () => {
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
        reader.collect = async (limits, signal, cache) => {
          collects++;
          entered();
          await gate;
          signal.throwIfAborted();
          return collect(limits, signal, cache);
        };
        return reader;
      },
    );
    try {
      const previous = cached
        ? await (await t.request("refresh", "POST")).json()
        : undefined;
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
      if (previous) assert.equal(result.id, previous.snapshotId);
      assert.equal(collects, 1);
      assert.equal(
        (
          await (
            await t.request(
              "workbench",
              "GET",
              other.cookie,
              other.connection.id,
            )
          ).json()
        ).id,
        result.id,
      );
    } finally {
      release();
      await t.cleanup();
    }
  });
