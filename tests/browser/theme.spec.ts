import { test, expect, type Page } from "@playwright/test";

const KEY = "openfolio.theme";
// 阻止应用脚本执行，确认主题由首帧前的内联脚本写入，而不是水合后补上。
async function blockAppScripts(page: Page) {
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
}
const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

test("first paint follows the system theme until a choice is stored", async ({
  page,
}) => {
  await blockAppScripts(page);
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    expect(await theme(page)).toBe(scheme);
  }
  await page.evaluate((key) => localStorage.setItem(key, "dark"), KEY);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  expect(await theme(page)).toBe("dark");
  await page.evaluate((key) => localStorage.setItem(key, "light"), KEY);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await theme(page)).toBe("light");
});

test("unset choice tracks live system changes on every route", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/share?repository=https%3A%2F%2Fexample.invalid%2Fa%2Fb&change=missing",
    "/preview/missing",
  ]) {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(path);
    expect(await theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
  }
});

test("flat brand mark and app icons replace the bitmap logo", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "OpenFolio" })).toBeVisible();
  await expect(page.locator('img[src*="openfolio-mark"]')).toHaveCount(0);
  const icons = await page
    .locator('head link[rel="icon"], head link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute("href") ?? ""));
  expect(icons.some((href) => href.startsWith("/icon.svg"))).toBe(true);
  expect(icons.some((href) => href.startsWith("/apple-icon.png"))).toBe(true);
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/x-icon");
});
