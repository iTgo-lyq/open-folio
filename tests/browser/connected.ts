import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
export const repoKey = createHash("sha256")
  .update(JSON.stringify(["github", "fixture.test", "1"]))
  .digest("hex");
export const repositoryQuery = `repo=${repoKey}&provider=github&instance=fixture.test&repositoryId=1&fullName=acme%2Ffixture`;
export const origin = "http://127.0.0.1:10682";
export const testPassword = "fixture-password";
export async function revisionHeaders(request: APIRequestContext) {
  const session = await (await request.get("/api/session")).json();
  return { origin, "X-OpenFolio-Revision": String(session.browserRevision) };
}
export async function loginAccount(
  request: APIRequestContext,
  username: string,
) {
  const r = await request.post("/api/session", {
    headers: { origin },
    data: { username, password: testPassword },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).session;
}
export async function connectRequest(
  request: APIRequestContext,
  token = "token-a",
  username?: string,
) {
  let session = await (await request.get("/api/session")).json();
  if (!session.authenticated) {
    if (username) session = await loginAccount(request, username);
    else {
      const r = await request.post("/api/accounts/register", {
        headers: { origin },
        data: { username: `user-${randomUUID()}`, password: testPassword },
      });
      expect(r.status()).toBe(201);
      session = (await r.json()).session;
    }
  }
  const response = await request.post("/api/connections", {
    headers: await revisionHeaders(request),
    data: { providerId: "github", token },
  });
  expect(response.status()).toBe(201);
  const result = await response.json(),
    id = result.connection.id;
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/connections/${id}/discovery`)).json())
          .discovery?.state,
    )
    .toBe("complete");
  const url = (path: string) =>
    `/api/repositories/${repoKey}/${path}${path.includes("?") ? "&" : "?"}connectionId=${id}`;
  const fresh = await request.post(url("refresh"), { headers: { origin } });
  expect(fresh.ok()).toBe(true);
  return { id, url, username: session.account.username as string };
}
export const test = base.extend<{
  personal: { id: string; url: (path: string) => string; username: string };
}>({
  personal: [
    async ({ context }, use) => {
      await context.request.post("/_fixture/control", {
        data: { reset: true, newSessionScope: true },
      });
      await use(await connectRequest(context.request));
    },
    { auto: true },
  ],
  request: async ({ context }, use) => use(context.request),
});
export { expect };
