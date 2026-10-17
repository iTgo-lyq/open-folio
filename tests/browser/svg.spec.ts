import { test, expect, repositoryQuery } from "./connected";
import type { DocumentRef } from "../../src/lib/model";

test("SVG diagrams render styles and internal references in Markdown and the image viewer", async ({
  page,
}) => {
  const probes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("svg-probe")) probes.push(request.url());
  });
  await page.goto(`/?${repositoryQuery}&m=specs&s=diagrams`);
  const image = page.getByRole("img", { name: "架构示意", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(320);
  const pixels = await image.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(el, 0, 0);
    return {
      background: [...ctx.getImageData(1, 1, 1, 1).data],
      gradient: [...ctx.getImageData(40, 40, 1, 1).data],
      arrow: [...ctx.getImageData(256, 60, 1, 1).data],
    };
  });
  expect(pixels.background).toEqual([234, 242, 255, 255]);
  expect(pixels.gradient[0]).toBe(0);
  expect(pixels.gradient[1]).toBeGreaterThan(100);
  expect(pixels.gradient[2]).toBeGreaterThan(0);
  expect(pixels.arrow).toEqual([23, 37, 84, 255]);
  await expect(page.getByText("图片未预览：损坏示意")).toBeVisible();
  await expect(page.getByText("图片未预览：外部示意")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "隔离示意" })
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(100);
  expect(await page.evaluate(() => "svgInjected" in window)).toBe(false);
  await page.getByRole("link", { name: "打开架构图" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: "diagram.svg", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("docs/project/specs/diagrams/diagram.svg");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(probes).toEqual([]);
});

test("SVG asset GET and HEAD retain authorization and sandbox direct navigation", async ({
  page,
  request,
  personal,
}) => {
  const work = await (await request.get(personal.url("workbench"))).json();
  const documents: DocumentRef[] = work.documents;
  const asset = (name: string) =>
    personal.url(
      `assets/${documents.find((d) => d.path === "docs/project/specs/diagrams/" + name)!.id}?snapshot=${work.id}`,
    );
  for (const response of [
    await request.get(asset("diagram.svg")),
    await request.head(asset("diagram.svg")),
  ]) {
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-security-policy"]).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  }
  expect(await (await request.head(asset("diagram.svg"))).body()).toHaveLength(
    0,
  );
  expect((await request.get(asset("broken.svg"))).status()).toBe(400);
  const probes: string[] = [];
  const blocked = new Map<string, string>();
  const received: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("svg-probe")) probes.push(r.url());
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("svg-probe"))
      blocked.set(r.url(), r.failure()?.errorText ?? "");
  });
  page.on("response", (r) => {
    if (r.url().includes("svg-probe")) received.push(r.url());
  });
  await page.goto(asset("isolated.svg"));
  expect(await page.evaluate(() => "svgInjected" in window)).toBe(false);
  expect(
    await page.locator("rect").evaluate((el) => getComputedStyle(el).fill),
  ).toBe("rgb(34, 197, 94)");
  expect(
    await page.evaluate(() => {
      try {
        localStorage.getItem("probe");
        return "accessible";
      } catch (error) {
        return (error as Error).name;
      }
    }),
  ).toBe("SecurityError");
  // Chromium reports attempted requests before CSP blocks them; none reaches
  // the network, and scripts/frames cannot start a request at all.
  expect(probes.map((url) => new URL(url).pathname).sort()).toEqual([
    "/svg-probe-image",
    "/svg-probe-style",
  ]);
  await expect.poll(() => blocked.size).toBe(probes.length);
  for (const failure of blocked.values()) expect(failure).toMatch(/csp/i);
  expect(received).toEqual([]);
  await request.post("/_fixture/control", {
    data: { revoke: "token-a", advancePermissions: 300_000 },
  });
  expect((await request.get(asset("diagram.svg"))).status()).toBe(401);
  expect((await request.head(asset("diagram.svg"))).status()).toBe(401);
});
