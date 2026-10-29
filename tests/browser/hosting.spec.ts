import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fixture } from "../fixture.ts";
import {
  digestPrefix,
  encodeUploadHeader,
  uploadType,
} from "../../.agents/skills/spec-trail/prototype/scripts/upload-protocol.mjs";
import { requestIdentity } from "../../.agents/skills/spec-trail/prototype/scripts/publication-contract.mjs";

test("built-in public assets load modules, styles and images on same and other origins without capability restrictions", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  expect(
    (
      await request.post("/api/access", {
        data: { secret: "fixture-admin-password" },
      })
    ).ok(),
  ).toBe(true);
  const discovery = await request.get("/api/prototype-hosting");
  expect(discovery.ok()).toBeTruthy();
  const { uploadPath } = await discovery.json();
  const content: Record<string, string> = {
    "assets/chunk.js": "export const label='模块已加载';",
    "assets/pixel.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>',
    "assets/start.js":
      "const {label}=await import('./chunk.js');document.querySelector('h1').textContent=label;let n=0;document.querySelector('button').onclick=e=>e.target.textContent=String(++n);",
    "assets/style.css": "h1 { color: rgb(10, 20, 30); }",
    "index.html":
      '<!doctype html><html><head><link rel="stylesheet" href="./assets/style.css"></head><body><h1>加载中</h1><button>0</button><img src="./assets/pixel.svg" alt="图标"><script type="module" src="./assets/start.js"></script></body></html>',
  };
  const files = Object.entries(content).map(([path, body]) => ({
    path,
    size: Buffer.byteLength(body),
  }));
  const hash = createHash("sha256");
  for (const f of files)
    hash.update(digestPrefix(f.path, f.size)).update(content[f.path]);
  const publication = {
    schemaVersion: 1,
    repository: "https://example.test/unregistered.git",
    sourceCommit: "a".repeat(40),
    artifactDirectory: "/local/dist",
    digest: `sha256:${hash.digest("hex")}`,
    entries: [{ id: "screen", entryPath: "index.html" }],
    requestId: "",
  };
  publication.requestId = requestIdentity(publication);
  const bytes = Buffer.concat([
    encodeUploadHeader(publication, files),
    ...files.map((f) => Buffer.from(content[f.path])),
  ]);
  const publicContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    // The cross-origin test stays on loopback; Chromium requires an explicit local-network grant.
    await page.context().grantPermissions(["local-network-access"]);
    expect(
      (
        await publicContext.request.get(baseURL + "/api/prototype-hosting")
      ).status(),
    ).toBe(401);
    const uploaded = await publicContext.request.post(baseURL + uploadPath, {
      headers: { "content-type": uploadType },
      data: bytes,
    });
    expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
    const result = await uploaded.json();
    const url = new URL(result.entries[0].path, baseURL + "/").href;
    const response = await publicContext.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-frame-options"]).toBeUndefined();
    expect(response.headers()["content-security-policy"]).toBeUndefined();
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    const html = `<iframe title="hosted" src="${url}"></iframe>`;
    await page.route("**/hosting-check", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    for (const origin of [
      baseURL!,
      baseURL!.replace("127.0.0.1", "localhost"),
    ]) {
      await page.goto(origin + "/hosting-check");
      const frame = page.frameLocator("iframe");
      await expect(
        frame.getByRole("heading", { name: "模块已加载" }),
      ).toHaveCSS("color", "rgb(10, 20, 30)");
      await frame.getByRole("button").click();
      await expect(frame.getByRole("button")).toHaveText("1");
      expect(
        await frame
          .getByAltText("图标")
          .evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
      ).toBeTruthy();
      const child = page.frames().find((f) => f.url() === url)!;
      expect(
        await child.evaluate(() => {
          try {
            return !!parent.document;
          } catch {
            return false;
          }
        }),
      ).toBe(origin === baseURL);
      expect(
        await child.evaluate(() => {
          try {
            return document.cookie;
          } catch {
            return "isolated";
          }
        }),
      ).not.toBe("isolated");
      expect(
        await child.evaluate(async () => {
          try {
            await fetch("/api/config", { credentials: "include" });
            return "exposed";
          } catch {
            return "blocked";
          }
        }),
      ).toBe("exposed");
    }
    const anonymous = await publicContext.newPage();
    await anonymous.goto(url);
    await expect(
      anonymous.getByRole("heading", { name: "模块已加载" }),
    ).toBeVisible();
    expect(
      await anonymous.evaluate(() => {
        try {
          return document.cookie;
        } catch {
          return "isolated";
        }
      }),
    ).not.toBe("isolated");
  } finally {
    await publicContext.close();
  }
});

test("skill CLI configures hosting, uploads a build and registers immutable current and Change references", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture();
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const run = (script: string, args: string[]) =>
      execFileSync(
        process.execPath,
        [
          resolve(`.agents/skills/spec-trail/prototype/scripts/${script}`),
          ...(script === "publish.mjs"
            ? [args[0], "--repo", f.author, ...args.slice(1)]
            : ["--repo", f.author, ...args]),
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            OPENFOLIO_ADMIN_PASSWORD: "fixture-admin-password",
          },
        },
      );
    run("setup.mjs", [
      "--accept",
      "--hosting",
      "openfolio",
      "--openfolio-url",
      baseURL!,
      "--fetch-upload-url",
    ]);
    const workflow = JSON.parse(
      await readFile(join(f.author, "docs/project/workflow.json"), "utf8"),
    );
    expect(workflow.prototype.hosting.uploadUrl).toContain(
      "/api/prototype-uploads/",
    );
    expect(workflow.openfolioUrl).toBe(baseURL);
    f.git(["checkout", "-b", "change/cli-upload"]);
    await f.put(
      "docs/project/changes/cli-upload/change.json",
      JSON.stringify({
        schemaVersion: 1,
        id: "cli-upload",
        title: "CLI upload",
        branch: "change/cli-upload",
        size: "small",
        status: "active",
        stage: "execution",
        confirmations: {},
        tasks: { T1: { title: "Prototype", status: "doing" } },
        closure: {},
      }),
    );
    f.commit();
    const entries = join(f.root, "entries.json"),
      request = join(f.root, "request.json"),
      result = join(f.root, "result.json");
    await writeFile(
      entries,
      JSON.stringify([{ id: "welcome", entryPath: "welcome/index.html" }]),
    );
    run("publish.mjs", [
      "prepare",
      "--directory",
      "packages/prototype/dist",
      "--entries",
      entries,
      "--repository",
      "https://example.test/cli.git",
      "--out",
      request,
    ]);
    const output = run("publish.mjs", [
      "upload",
      "--request",
      request,
      "--result",
      result,
      "--change",
      "cli-upload",
    ]);
    expect(output).not.toContain(workflow.prototype.hosting.uploadUrl);
    const published = JSON.parse(await readFile(result, "utf8"));
    const manifest = JSON.parse(
      await readFile(
        join(f.author, "packages/prototype/prototype.json"),
        "utf8",
      ),
    );
    const state = JSON.parse(
      await readFile(
        join(f.author, "docs/project/changes/cli-upload/change.json"),
        "utf8",
      ),
    );
    expect(manifest.entries[0].artifact).toEqual(state.previews[0].artifact);
    expect(manifest.entries[0].artifact.url).toBe(published.entries[0].url);
    const page = await context.newPage();
    await page.goto(published.entries[0].url);
    await expect(page.locator("h1")).toBeVisible();
    expect((await context.request.get(published.entries[0].url)).status()).toBe(
      200,
    );
    expect(await readFile(result, "utf8")).not.toContain(
      workflow.prototype.hosting.uploadUrl,
    );
  } finally {
    await context.close();
    await f.cleanup();
  }
});
