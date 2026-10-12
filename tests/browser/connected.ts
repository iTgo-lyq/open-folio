import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
export const repoKey = createHash("sha256")
  .update(JSON.stringify(["github", "fixture.test", "1"]))
  .digest("hex");
export const repositoryQuery = `repo=${repoKey}&provider=github&instance=fixture.test&repositoryId=1&fullName=acme%2Ffixture`;
export async function connectRequest(
  request: APIRequestContext,
  token = "token-a",
) {
  const response = await request.post("/api/session", {
    headers: { origin: "http://127.0.0.1:10682" },
    data: { providerId: "github", username: "reader", token },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  const id = result.connection.id;
  await expect
    .poll(async () => {
      const status = await (
        await request.get(`/api/connections/${id}/discovery`)
      ).json();
      return status.discovery?.state;
    })
    .toBe("complete");
  const url = (path: string) =>
    `/api/repositories/${repoKey}/${path}${path.includes("?") ? "&" : "?"}connectionId=${id}`;
  const fresh = await request.post(url("refresh"), {
    headers: { origin: "http://127.0.0.1:10682" },
  });
  expect(fresh.ok()).toBe(true);
  return { id, url };
}
export const test = base.extend<{
  personal: { id: string; url: (path: string) => string };
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
