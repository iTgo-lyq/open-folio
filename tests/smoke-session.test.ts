import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withSmokeSession } from "../scripts/smoke-session.ts";
import { personalFixture } from "./personal-fixture.ts";
import {
  removeIdentityResponse,
  sessionResponse,
} from "../src/server/connection-api.ts";

async function fixture(t: TestContext) {
  const f = await personalFixture();
  t.after(f.cleanup);
  const owner = await f.connect();
  await f.sessions.updatePreferences(owner.cookie, { module: "changes" });
  const original = await f.sessions.get(owner.cookie);
  const calls: { method: string; path: string; revision: string | null }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    calls.push({
      method: request.method,
      path,
      revision: request.headers.get("X-OpenFolio-Revision"),
    });
    if (path === "/api/session") return sessionResponse(request, f.sessions);
    if (path.startsWith("/api/session/identities/"))
      return removeIdentityResponse(
        request,
        path.split("/").at(-1)!,
        f.sessions,
      );
    throw new Error("Unexpected smoke request");
  };
  const state = async () =>
    JSON.parse(await readFile(join(f.sessions.root, "state.json"), "utf8"));
  return {
    ...f,
    calls,
    state,
    transport,
    options: {
      baseURL: "https://folio.test",
      token: "first",
      providerId: "sample",
      fetch: transport,
    },
    assertClean: async () => {
      const stored = await state();
      assert.equal(stored.sessions.length, 1);
      assert.equal(stored.browsers.length, 1);
      assert.equal(stored.sessions[0].id, owner.session.deviceSessionId);
      assert.deepEqual(await f.sessions.get(owner.cookie), original);
    },
  };
}

for (const fail of [false, true]) {
  test(`smoke ${fail ? "failure" : "success"} cleans its session and preserves the user's login`, async (t) => {
    const f = await fixture(t);
    const failure = new Error("smoke assertion failed");
    const run = withSmokeSession(
      f.options,
      async ({ request, session, browserCookie }) => {
        assert.equal((await f.state()).sessions.length, 2);
        assert.equal(
          (await (await request("/api/session")).json()).connected,
          true,
        );
        assert.ok(session.connected);
        assert.equal(
          (await f.sessions.get(browserCookie.value)).deviceSessionId,
          session.deviceSessionId,
        );
        if (fail) throw failure;
        return "checked";
      },
    );
    if (fail) await assert.rejects(run, (error) => error === failure);
    else assert.equal(await run, "checked");
    const logout = f.calls.findIndex((c) => c.method === "DELETE");
    assert.equal(f.calls[logout].revision, "1");
    assert.equal(f.calls[logout - 1].method, "GET");
    assert.equal(f.calls[logout + 1].method, "GET");
    await f.assertClean();
  });
}

test("malformed login JSON still cleans the Cookie established by that response", async (t) => {
  const f = await fixture(t);
  const transport: typeof fetch = async (input, init) => {
    const response = await f.transport(input, init);
    return init?.method === "POST"
      ? new Response("not-json", { status: 201, headers: response.headers })
      : response;
  };
  await assert.rejects(
    withSmokeSession({ ...f.options, fetch: transport }, async () => {
      assert.fail("The smoke callback must not run after failed login parsing");
    }),
    /Login smoke session returned invalid JSON/,
  );
  await f.assertClean();
});

test("a failed smoke request still cleans up with an independent timeout", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    withSmokeSession(f.options, async ({ request }) => {
      const signal = AbortSignal.abort();
      await request("/broken", { signal });
    }),
    /Smoke HTTP request failed or timed out/,
  );
  await f.assertClean();
});

test("cleanup reads the current revision and removes remembered test identities", async (t) => {
  const f = await fixture(t);
  await withSmokeSession(f.options, async ({ request }) => {
    const added = await request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "sample", token: "third" }),
    });
    assert.equal(added.status, 201);
  });
  assert.deepEqual(
    f.calls.filter((c) => c.method === "DELETE").map((c) => c.revision),
    ["2", "3"],
  );
  await f.assertClean();
});

test("cleanup retries a revision conflict with a fresh session read", async (t) => {
  const f = await fixture(t);
  let conflicted = false;
  const transport: typeof fetch = async (input, init) => {
    if (init?.method === "DELETE" && !conflicted) {
      conflicted = true;
      const request = new Request(input, init);
      const cookie = request.headers.get("Cookie")!.split("=")[1];
      await f.sessions.login(
        cookie,
        "sample",
        "first",
        undefined,
        new AbortController().signal,
      );
    }
    return f.transport(input, init);
  };
  await withSmokeSession({ ...f.options, fetch: transport }, async () => {});
  assert.deepEqual(
    f.calls.filter((c) => c.method === "DELETE").map((c) => c.revision),
    ["1", "2"],
  );
  await f.assertClean();
});

test("cleanup confirms logout after a response was lost", async (t) => {
  const f = await fixture(t);
  const transport: typeof fetch = async (input, init) => {
    const response = await f.transport(input, init);
    if (init?.method === "DELETE") throw new Error("response lost");
    return response;
  };
  await withSmokeSession({ ...f.options, fetch: transport }, async () => {});
  await f.assertClean();
});

for (const failure of ["http", "false-success", "malformed-session"]) {
  test(`cleanup reports persistent ${failure} without hiding the check failure`, async (t) => {
    const f = await fixture(t);
    let cleaning = false;
    let attempts = 0;
    const transport: typeof fetch = async (input, init) => {
      if (cleaning && failure === "malformed-session") {
        attempts++;
        return Response.json({ connected: false });
      }
      if (init?.method === "DELETE") {
        attempts++;
        return failure === "http"
          ? Response.json({ error: "failed" }, { status: 503 })
          : Response.json({ connected: false });
      }
      return f.transport(input, init);
    };
    const original = new Error("original smoke failure");
    await assert.rejects(
      withSmokeSession({ ...f.options, fetch: transport }, async () => {
        cleaning = true;
        throw original;
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors[0], original);
        assert.match(
          error.errors[1].message,
          /cleanup failed after 3 attempts/,
        );
        return true;
      },
    );
    assert.equal(attempts, 3);
    assert.equal((await f.state()).sessions.length, 2);
  });
}

test("a successful check cannot hide cleanup failure", async (t) => {
  const f = await fixture(t);
  const transport: typeof fetch = async (input, init) =>
    init?.method === "DELETE"
      ? Response.json({}, { status: 503 })
      : f.transport(input, init);
  await assert.rejects(
    withSmokeSession({ ...f.options, fetch: transport }, async () => "passed"),
    /cleanup failed after 3 attempts/,
  );
});

test("the helper rejects cross-origin requests and never accepts a supplied user Cookie", async (t) => {
  const f = await fixture(t);
  await withSmokeSession(f.options, async ({ request, session }) => {
    await assert.rejects(request("https://other.test/"), /configured origin/);
    const result = await (
      await request("/api/session", {
        headers: { Cookie: "openfolio-session=foreign" },
      })
    ).json();
    assert.equal(result.deviceSessionId, session.deviceSessionId);
  });
  await f.assertClean();
});
