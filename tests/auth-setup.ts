import { request } from "@playwright/test";
export default async function setup() {
  const client = await request.newContext({
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    const response = await client.post("/api/access", {
      data: { secret: "fixture-admin-password" },
    });
    if (!response.ok())
      throw new Error(`Admin fixture login failed: ${response.status()}`);
    await client.storageState({ path: "artifacts/e2e-admin.json" });
  } finally {
    await client.dispose();
  }
}
