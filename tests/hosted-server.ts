import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { build } from "vite";
import { chromium } from "playwright";
// Test host owns its React build, CORS and TLS. OpenFolio only reads its reference.
export async function hostedServer(root: string) {
  const dist = join(root, "hosted-dist");
  await build({
    configFile: false,
    root: resolve("tests/hosted-fixture"),
    base: "./",
    build: { outDir: dist, emptyOutDir: true },
  });
  const key = join(root, "key.pem"),
    cert = join(root, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (req, res) => {
      const path = new URL(req.url!, "https://127.0.0.1:10685").pathname;
      const relative = path.replace(/^\/v1\//, "");
      if (
        relative === path ||
        relative.includes("..") ||
        !/^[a-zA-Z0-9_./-]+$/.test(relative)
      ) {
        res.writeHead(404).end();
        return;
      }
      try {
        const bytes = await readFile(join(dist, relative));
        res.writeHead(200, {
          "Content-Type":
            (
              {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript",
                ".css": "text/css",
                ".png": "image/png",
              } as Record<string, string>
            )[extname(relative)] ?? "application/octet-stream",
          "Access-Control-Allow-Origin": "*",
          "Content-Security-Policy": "frame-ancestors http://127.0.0.1:10682",
          "Referrer-Policy": "no-referrer",
        });
        res.end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    },
  );
  await new Promise<void>((resolve) =>
    server.listen(10685, "127.0.0.1", resolve),
  );
  const browser = await chromium.launch({
    chromiumSandbox: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    for (const [device, width, height] of [
      ["pc-web", 1440, 900],
      ["mobile", 390, 844],
    ] as const) {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width, height },
      });
      await page.goto("https://127.0.0.1:10685/v1/index.html");
      await page.getByRole("button", { name: "已添加 0 次" }).waitFor();
      await page.screenshot({ path: join(dist, `${device}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return server;
}
