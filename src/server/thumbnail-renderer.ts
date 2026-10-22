import type { BrowserServer } from "playwright";
import { tmpdir } from "node:os";
import { AppError } from "./errors.ts";
import { sandboxCsp } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

export type ThumbnailViewport = { width: number; height: number };
export type ThumbnailSource = string | { url: string };
export const THUMBNAIL_VERSION = "playwright-1.63.0-jpeg-1";

// Chromium receives no workbench session, repository credentials or user profile.
export async function renderThumbnail(
  source: ThumbnailSource,
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
    const hosted = typeof source !== "string";
    const target = hosted
      ? source.url
      : "https://openfolio-thumbnail.invalid/index.html";
    const proxy = hosted && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
    const { chromium } = await import("playwright");
    server = await chromium.launchServer({
      host: "127.0.0.1",
      chromiumSandbox: true,
      timeout: Math.min(timeoutMs, 5_000),
      env: { PATH: process.env.PATH ?? "", HOME: tmpdir(), LANG: "C.UTF-8" },
      ...(proxy
        ? { proxy: { server: proxy, bypass: process.env.NO_PROXY } }
        : {}),
      args: [
        "--js-flags=--max-old-space-size=128",
        ...(!hosted
          ? [
              "--proxy-server=http://127.0.0.1:9",
              "--proxy-bypass-list=<-loopback>",
              "--host-resolver-rules=MAP * ~NOTFOUND",
            ]
          : []),
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
      offline: !hosted,
      ...(hosted ? { serviceWorkers: "block" as const } : {}),
      locale: "zh-CN",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    let failed = false;
    let delivered = false;
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (hosted) {
        const url = new URL(request.url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          ["GET", "HEAD"].includes(request.method())
        ) {
          await route.continue();
          return;
        }
      }
      if (
        !hosted &&
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
          body: source as string,
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
    if (hosted) {
      page.on("requestfailed", () => {
        failed = true;
      });
      page.on("response", (response) => {
        if (response.status() >= 400) failed = true;
      });
      context.on("page", (popup) => {
        void popup.close();
      });
    }
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
    if (failed || (!hosted && page.url().split("#")[0] !== target))
      throw Error("Invalid thumbnail render");
    return result;
  } catch {
    throw new AppError(
      expired ? "THUMBNAIL_TIMEOUT" : "THUMBNAIL_RENDER_FAILED",
      expired
        ? "截图生成超时，仍可打开原型预览。"
        : "截图暂不可用，请检查原型加载及服务 Chromium 沙箱环境。",
    );
  } finally {
    clearTimeout(timer);
    await server?.kill().catch(() => {});
  }
}
