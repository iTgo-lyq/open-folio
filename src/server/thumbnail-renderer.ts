import type { BrowserServer } from "playwright";
import { tmpdir } from "node:os";
import { AppError } from "./errors.ts";
import { sandboxCsp } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

export type ThumbnailViewport = { width: number; height: number };
export const THUMBNAIL_VERSION = "playwright-1.63.0-jpeg-1";

// No workbench URL, credentials, profile or project code is given to Chromium.
export async function renderThumbnail(
  html: string,
  viewport: ThumbnailViewport,
  timeoutMs = 12_000,
): Promise<Buffer> {
  let server: BrowserServer | undefined;
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void server?.kill().catch(() => {});
  }, timeoutMs);
  try {
    const { chromium } = await import("playwright");
    server = await chromium.launchServer({
      host: "127.0.0.1",
      chromiumSandbox: true,
      timeout: Math.min(timeoutMs, 5_000),
      env: { PATH: process.env.PATH ?? "", HOME: tmpdir(), LANG: "C.UTF-8" },
      args: [
        "--js-flags=--max-old-space-size=128",
        "--proxy-server=http://127.0.0.1:9",
        "--proxy-bypass-list=<-loopback>",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ],
    });
    if (expired) throw Error("deadline");
    const browser = await chromium.connect(server.wsEndpoint(), {
      timeout: Math.min(timeoutMs, 5_000),
    });
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      // CSP's opaque origin and worker-src:none already prohibit workers.
      // Playwright's serviceWorkers:block init script throws in opaque origins.
      acceptDownloads: false,
      offline: true,
      locale: "zh-CN",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    let failed = false;
    let delivered = false;
    const target = "https://openfolio-thumbnail.invalid/index.html";
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        !delivered &&
        request.url() === target &&
        request.method() === "GET" &&
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        delivered = true;
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          headers: { "content-security-policy": sandboxCsp },
          body: html,
        });
      } else {
        failed = true;
        await route.abort();
      }
    });
    await context.routeWebSocket("**/*", (socket) => {
      failed = true;
      socket.close();
    });
    page.on("pageerror", () => {
      failed = true;
    });
    await page.addInitScript(() => {
      addEventListener("securitypolicyviolation", () => {
        throw new Error("Thumbnail blocked an unsupported resource");
      });
    });
    await page.goto(target, { waitUntil: "load", timeout: 5_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => img.decode().catch(() => {})),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = await page.screenshot({
      type: "jpeg",
      quality: 72,
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      timeout: 5_000,
    });
    if (failed || page.url().split("#")[0] !== target)
      throw Error("Invalid offline render");
    return result;
  } catch {
    throw new AppError(
      expired ? "THUMBNAIL_TIMEOUT" : "THUMBNAIL_RENDER_FAILED",
      expired
        ? "截图生成超时，仍可打开原型预览。"
        : "截图暂不可用，请检查原型离线运行及服务 Chromium 沙箱环境。",
    );
  } finally {
    clearTimeout(timer);
    await server?.kill().catch(() => {});
  }
}
