import { createHmac } from "node:crypto";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adminPassword,
  adminPasswordPath,
  login,
  requireAdmin,
  requireSameOrigin,
} from "../src/server/access.ts";
import { readConfigSnapshot, saveConfig } from "../src/server/config.ts";
import { POST } from "../src/app/api/access/route.ts";
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "openfolio-access-"));
  const before = Object.fromEntries(
    ["OPENFOLIO_DATA_DIR", "OPENFOLIO_CONFIG", "OPENFOLIO_ADMIN_PASSWORD"].map(
      (k) => [k, process.env[k]],
    ),
  );
  process.env.OPENFOLIO_DATA_DIR = join(root, "data");
  delete process.env.OPENFOLIO_CONFIG;
  delete process.env.OPENFOLIO_ADMIN_PASSWORD;
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = await readConfigSnapshot();
  await saveConfig({ schemaVersion: 2 }, snapshot.revision);
}
const request = (cookie = "", url = "http://localhost/api/access") =>
  new Request(url, { headers: { cookie } });
const withCookie = (header: string) => request(header.split(";")[0]);
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

test("admin initialization is private, concurrent-safe, persistent and overridable", async (t) => {
  await setup(t);
  const passwords = await Promise.all(
    Array.from({ length: 20 }, () => adminPassword()),
  );
  assert.equal(new Set(passwords).size, 1);
  assert.match(passwords[0], /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await stat(adminPasswordPath())).mode & 0o777, 0o600);
  assert.equal(
    (await readFile(adminPasswordPath(), "utf8")).trim(),
    passwords[0],
  );
  assert.deepEqual((await readdir(process.env.OPENFOLIO_DATA_DIR!)).sort(), [
    "admin-password",
    "config.json",
  ]);
  process.env.OPENFOLIO_ADMIN_PASSWORD = "environment-password";
  assert.equal(await adminPassword(), "environment-password");
  assert.equal(
    (await readFile(adminPasswordPath(), "utf8")).trim(),
    passwords[0],
  );
  delete process.env.OPENFOLIO_ADMIN_PASSWORD;
  await writeFile(adminPasswordPath(), "\n");
  await assert.rejects(adminPassword(), { code: "ACCESS_SECRET_UNAVAILABLE" });
});

test("admin cookies authorize operations only and rotate with the deployment password", async (t) => {
  await setup(t);
  const password = await adminPassword();
  const header = await login(
    request("", "https://folio.example/api/access"),
    password,
  );
  assert.match(header, /; Secure$/);
  assert.ok(!header.includes(password));
  const admin = withCookie(header);
  await requireAdmin(admin);
  process.env.OPENFOLIO_ADMIN_PASSWORD = "rotated-password";
  await assert.rejects(requireAdmin(admin), { code: "ADMIN_REQUIRED" });
  await assert.rejects(login(request(), "wrong"), { code: "ACCESS_DENIED" });
});

test("access endpoint validates scope and bounded JSON without disclosing secrets", async (t) => {
  await setup(t);
  for (const body of [
    null,
    [],
    { secret: "test", unknown: null },
    { secret: "test", admin: true },
    { secret: 7 },
  ])
    assert.equal((await post(body)).status, 400);
  assert.equal((await post({ secret: "x".repeat(4096) })).status, 413);
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/access", {
          method: "POST",
          body: "secret=value",
        }),
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      )
    ).status,
    400,
  );
});

test("mutating endpoints reject cross-origin requests including opaque preview frames", async (t) => {
  await setup(t);
  for (const origin of ["null", "https://other.test"]) {
    const req = new Request("http://localhost/api/access", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ secret: await adminPassword() }),
    });
    assert.equal((await POST(req)).status, 403);
    assert.throws(() => requireSameOrigin(req), { code: "ORIGIN_DENIED" });
  }
  requireSameOrigin(
    new Request("http://internal/api/access", {
      headers: { host: "folio.example", origin: "https://folio.example" },
    }),
  );
});

test("knowing the administrator password does not reveal the independent cookie signing secret", async (t) => {
  await setup(t);
  process.env.OPENFOLIO_ADMIN_PASSWORD = "known-admin-password";
  await login(request(), process.env.OPENFOLIO_ADMIN_PASSWORD);
  assert.equal(
    (await stat(join(process.env.OPENFOLIO_DATA_DIR!, "access-secret"))).mode &
      0o777,
    0o600,
  );
  const forged = createHmac("sha256", process.env.OPENFOLIO_ADMIN_PASSWORD)
    .update(JSON.stringify(["admin-v1"]))
    .digest("base64url");
  await assert.rejects(requireAdmin(request(`openfolio-admin=${forged}`)), {
    code: "ADMIN_REQUIRED",
  });
});
