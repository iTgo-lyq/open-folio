import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEVICE_VIEWPORTS } from "../../src/lib/preview-viewport.ts";
import {
  htmlIssues,
  sandboxCsp,
} from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

const { values } = parseArgs({
  options: {
    entry: { type: "string" },
    out: { type: "string" },
    device: { type: "string", multiple: true },
    viewport: { type: "string" },
  },
});
if (!values.entry || (values.device && values.viewport))
  throw Error(
    "Usage: screenshot.mjs --entry <HTML> [--out <directory>] [--device pc-web|ipad|mobile | --viewport WIDTHxHEIGHT]",
  );
const entry = resolve(values.entry),
  output = resolve(values.out || dirname(entry));
const devices = values.device || Object.keys(DEVICE_VIEWPORTS);
if (devices.some((device) => !Object.hasOwn(DEVICE_VIEWPORTS, device)))
  throw Error("Unknown device");
const match = values.viewport?.match(/^(\d+)x(\d+)$/);
if (
  values.viewport &&
  (!match ||
    match.slice(1).some((value) => Number(value) < 1 || Number(value) > 4096))
)
  throw Error(
    "Viewport must be WIDTHxHEIGHT, with each dimension between 1 and 4096",
  );
const views = match
  ? [["custom", { width: Number(match[1]), height: Number(match[2]) }]]
  : [...new Set(devices)].map((device) => [device, DEVICE_VIEWPORTS[device]]);
const html = await readFile(entry);
const issues = htmlIssues(html.toString());
if (issues.length) throw Error(issues.join("; "));
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (request.url === "/favicon.ico") return response.writeHead(204).end();
  if (request.url === "/")
    return response.end(
      '<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/preview"></iframe>',
    );
  if (request.url !== "/preview") return response.writeHead(404).end();
  response.setHeader("Content-Security-Policy", sandboxCsp);
  response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    chromiumSandbox: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  await mkdir(output, { recursive: true });
  for (const [name, viewport] of views) {
    const page = await browser.newPage({
        viewport,
        deviceScaleFactor: 1,
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}`);
    });
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    await page.goto(origin, { waitUntil: "networkidle" });
    await page
      .frameLocator("iframe")
      .locator("body")
      .waitFor({ state: "attached", timeout: 10000 });
    const frame = page.frames().find((frame) => frame.parentFrame());
    await frame.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    if (errors.length)
      throw Error(`Prototype render failed: ${errors.join("; ")}`);
    await page.locator("iframe").screenshot({
      path: join(output, `${name}.png`),
      animations: "disabled",
    });
    console.log(
      `${name}: ${viewport.width}x${viewport.height} → ${join(output, `${name}.png`)}`,
    );
    await page.close();
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
