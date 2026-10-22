import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { renderThumbnail } from "../src/server/thumbnail-renderer.ts";
import { chromium } from "playwright";

test("hosted rendering loads cross-origin modules, CSS and images without cookies and rejects failed loads", async (t) => {
  const requests: { path: string; cookie: string | undefined }[] = [];
  const resources = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      res.end("html,body{margin:0;background:rgb(0,220,0)}");
    } else if (req.url === "/module.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end("document.body.dataset.ready='yes'");
    } else {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      );
    }
  });
  await new Promise<void>((resolve) =>
    resources.listen(0, "127.0.0.1", resolve),
  );
  const assets = `http://127.0.0.1:${(resources.address() as { port: number }).port}`;
  const host = createServer((req, res) => {
    requests.push({ path: req.url!, cookie: req.headers.cookie });
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/broken") res.writeHead(503).end("unavailable");
    else if (req.url === "/hang") res.end("<script>while(true){}</script>");
    else
      res.end(
        `<!doctype html><html><head><link rel="stylesheet" href="${assets}/style.css"></head><body><img src="${assets}/pixel.svg"><script type="module" src="${assets}/module.js"></script></body></html>`,
      );
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  t.after(() =>
    Promise.all(
      [host, resources].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    ),
  );
  const base = `http://127.0.0.1:${(host.address() as { port: number }).port}`;
  const viewport = { width: 390, height: 844 };
  const body = await renderThumbnail({ url: base + "/screen" }, viewport);
  const browser = await chromium.launch({ chromiumSandbox: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const rendered = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      pixel: [...ctx.getImageData(30, 30, 1, 1).data],
    };
  }, body.toString("base64"));
  assert.equal(rendered.width, 390);
  assert.equal(rendered.height, 844);
  assert(rendered.pixel[1] > 190 && rendered.pixel[0] < 10);
  assert(requests.every((req) => !req.cookie));
  await assert.rejects(renderThumbnail({ url: base + "/broken" }, viewport), {
    code: "THUMBNAIL_RENDER_FAILED",
  });
  await assert.rejects(
    renderThumbnail({ url: base + "/hang" }, viewport, 1500),
    { code: "THUMBNAIL_TIMEOUT" },
  );
  assert(
    (
      await renderThumbnail(
        { url: base + "/screen" },
        { width: 320, height: 200 },
      )
    ).length > 100,
  );
});
