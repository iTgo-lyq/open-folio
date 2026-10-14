import test from "node:test";
import assert from "node:assert/strict";
import { personalFixture } from "./personal-fixture.ts";
import {
  tokenResponse,
  devicesResponse,
} from "../src/server/credential-api.ts";
import {
  sessionResponse,
  logoutAllResponse,
} from "../src/server/connection-api.ts";
const origin = "https://folio.test";
function request(
  cookie = "",
  path = "/api/session/token",
  method = "POST",
  body?: unknown,
  foreign = false,
) {
  return new Request(origin + path, {
    method,
    headers: {
      cookie: `openfolio-session=${cookie}`,
      origin: foreign ? "https://foreign.test" : origin,
      "X-OpenFolio-Revision": "1",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
test("token copy is explicit, current-only, private, and absent from summaries", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const copied = await tokenResponse(request(a.cookie), f.sessions);
  assert.equal(copied.status, 200);
  assert.deepEqual(await copied.json(), { token: "first" });
  assert.match(copied.headers.get("cache-control")!, /no-store/);
  const summary = await sessionResponse(
    request(a.cookie, "/api/session", "GET"),
    f.sessions,
    f.discovery,
  );
  const text = await summary.text();
  assert.ok(!text.includes('"token"'));
  assert.ok(!text.includes("credentialFingerprint"));
  assert.ok(!text.includes(a.cookie));
  assert.equal((await tokenResponse(request(), f.sessions)).status, 401);
  assert.equal(
    (
      await tokenResponse(
        request(a.cookie, undefined, undefined, undefined, true),
        f.sessions,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await tokenResponse(
        request(a.cookie, undefined, undefined, {
          workspaceId: a.connection.id,
        }),
        f.sessions,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await tokenResponse(
        request(a.cookie, "/api/session/token?workspaceId=x"),
        f.sessions,
      )
    ).status,
    400,
  );
  await f.sessions.remove(a.cookie);
  assert.equal(
    (await tokenResponse(request(a.cookie), f.sessions)).status,
    401,
  );
});
test("token copy rechecks the device after materializing the response", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect();
  const get = f.sessions.get.bind(f.sessions);
  f.sessions.get = async (cookie) => {
    await f.sessions.remove(cookie);
    return get(cookie);
  };
  const copied = await tokenResponse(request(a.cookie), f.sessions);
  assert.equal(copied.status, 401);
  assert.ok(!(await copied.text()).includes('"token"'));
});
test("device enumeration and revocation stay within the current credential", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(),
    other = await f.connect("", "second");
  const list = await devicesResponse(
    request(a.cookie, "/api/session/devices", "GET"),
    undefined,
    f.sessions,
  );
  const { devices } = await list.json();
  assert.equal(devices.length, 2);
  assert.equal(devices.filter((d: any) => d.current).length, 1);
  assert.ok(!JSON.stringify(devices).includes("cookieHash"));
  const outsider = (await f.sessions.devices(other.cookie))[0];
  assert.equal(
    (
      await devicesResponse(
        request(a.cookie, "/api/session/devices/x", "DELETE"),
        outsider.id,
        f.sessions,
      )
    ).status,
    404,
  );
  const victim = (await f.sessions.devices(b.cookie)).find((d) => d.current)!;
  const lease = await f.sessions.lease(b.cookie, b.connection.id);
  assert.equal(
    (
      await devicesResponse(
        request(a.cookie, "/api/session/devices/x", "DELETE", undefined, true),
        victim.id,
        f.sessions,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await devicesResponse(
        request(a.cookie, "/api/session/devices/x", "DELETE"),
        victim.id,
        f.sessions,
      )
    ).status,
    200,
  );
  await assert.rejects(lease.assertCurrent);
  lease.release();
  assert.equal((await f.sessions.get(a.cookie)).connected, true);
  assert.equal((await f.sessions.get(b.cookie)).connected, false);
  const own = (await f.sessions.devices(a.cookie))[0];
  const out = await devicesResponse(
    request(a.cookie, "/api/session/devices/x", "DELETE"),
    own.id,
    f.sessions,
  );
  assert.equal(out.headers.get("set-cookie"), null);
  assert.equal(out.status, 200);
  assert.equal((await f.sessions.get(other.cookie)).connected, true);
});
test("logout-all revokes only this workspace while preserving later recovery", async (t) => {
  const f = await personalFixture();
  t.after(f.cleanup);
  const a = await f.connect(),
    b = await f.connect(),
    other = await f.connect("", "second");
  assert.equal(
    (
      await logoutAllResponse(
        request(a.cookie, "/api/session/logout-all"),
        f.sessions,
      )
    ).status,
    200,
  );
  assert.equal((await f.sessions.get(b.cookie)).connected, false);
  assert.equal((await f.sessions.get(other.cookie)).connected, true);
  assert.equal((await f.connect()).connection.id, a.connection.id);
});
