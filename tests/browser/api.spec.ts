import { test, expect, repoKey } from "./connected";
test("personal API reads cached records and enforces input boundaries", async ({
  request,
  personal,
}) => {
  const work = await (await request.get(personal.url("workbench"))).json();
  expect(work.specs.length).toBeGreaterThan(0);
  const doc = work.documents.find(
    (d: { kind: string; readable: boolean }) =>
      d.kind === "markdown" && d.readable,
  );
  const response = await request.get(
    personal.url(`documents/${doc.id}?snapshot=${work.id}`),
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(
    (await request.get(personal.url("workbench?snapshot=../../etc"))).status(),
  ).toBe(400);
  expect(
    (
      await request.get(personal.url(`search?snapshot=${work.id}&q=工程`))
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(personal.url("refresh"), {
        headers: { origin: "https://else.test" },
      })
    ).status(),
  ).toBe(403);
});
test("periodic revalidation detects revoked credentials and then rejects cached reads", async ({
  request,
  personal,
}) => {
  const work = await (await request.get(personal.url("workbench"))).json();
  const doc = work.documents.find(
    (d: { kind: string }) => d.kind === "markdown",
  );
  const image = work.documents.find(
    (d: { kind: string }) => d.kind === "image",
  );
  await request.post("/_fixture/control", { data: { revoke: "token-a" } });
  expect((await request.get(personal.url("workbench"))).status()).toBe(200);
  await request.post("/_fixture/control", {
    data: { advancePermissions: 300_000 },
  });
  for (const path of [
    "workbench",
    `documents/${doc.id}?snapshot=${work.id}`,
    `assets/${image.id}?snapshot=${work.id}`,
    "prototypes",
  ]) {
    expect((await request.get(personal.url(path))).status()).toBe(401);
    expect((await request.head(personal.url(path))).status()).toBe(401);
  }
});
test("platform failure does not return stale snapshots and retired endpoints expose no old project names", async ({
  request,
  personal,
}) => {
  await request.post("/_fixture/control", { data: { unavailable: true } });
  expect((await request.get(personal.url("workbench"))).status()).toBe(200);
  await request.post("/_fixture/control", {
    data: { advancePermissions: 300_000 },
  });
  const denied = await request.get(personal.url("workbench"));
  expect(denied.status()).toBe(503);
  expect(await denied.text()).not.toContain("工程协作");
  for (const path of [
    "/api/projects",
    "/api/projects/fixture/workbench",
    "/api/projects/fixture/search",
    "/api/projects/fixture/documents/old",
  ]) {
    const res = await request.get(path);
    expect(res.status()).toBe(410);
    expect(await res.text()).not.toContain("测试项目");
  }
  await request.post("/_fixture/control", { data: { reset: true } });
  expect((await request.get(personal.url("workbench"))).status()).toBe(200);
});
