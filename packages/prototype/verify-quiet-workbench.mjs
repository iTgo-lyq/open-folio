import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import nextEnv from "@next/env";
import {
  htmlIssues,
  sandboxCsp,
} from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";
const root = dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(resolve(root, "../.."), false);
const routes = [
  "home",
  "specs",
  "changes",
  "prototypes",
  "credentials",
  "public",
];
const html = Object.fromEntries(
  await Promise.all(
    routes.map(async (route) => [
      route,
      await readFile(resolve(root, `dist/quiet-${route}/index.html`), "utf8"),
    ]),
  ),
);
for (const [route, source] of Object.entries(html))
  assert.deepEqual(htmlIssues(source), [], `${route} static contract`);
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  if (url.pathname === "/frame") {
    const route = url.searchParams.get("route") || "home";
    response.setHeader("Content-Security-Policy", sandboxCsp);
    response.end(html[route]);
    return;
  }
  const route = url.pathname.slice(1) || "home";
  if (!html[route]) {
    response.writeHead(404).end();
    return;
  }
  response.end(
    `<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/frame?route=${route}${url.hash}"></iframe>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = resolve(root, "../../artifacts/quiet-workbench");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  chromiumSandbox: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const failures = [],
  checks = [],
  errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.route("**/*", (r) =>
  new URL(r.request().url()).origin === origin
    ? r.continue()
    : (errors.push("External request: " + r.request().url()), r.abort()),
);
let frame;
async function open(
  route = "home",
  theme = "light",
  viewport = { width: 1440, height: 900 },
  scene = "normal",
) {
  await page.setViewportSize(viewport);
  await page.goto(origin + "/" + route);
  frame = page.frames().find((f) => f.parentFrame());
  await frame.waitForSelector("#main");
  await frame.evaluate(
    ({ route, theme, scene }) =>
      (location.hash = `#/${route}?theme=${theme}&scene=${scene}`),
    { route, theme, scene },
  );
  await frame.waitForFunction(
    (theme) => document.documentElement.dataset.theme === theme,
    theme,
  );
  await frame.locator("#review-scene").selectOption(scene);
}
async function check(name, fn) {
  try {
    await fn();
    checks.push(name);
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log("FAIL", name, e.message.slice(0, 400));
  }
}
async function noOverflow() {
  const result = await frame.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    dialogs: [...document.querySelectorAll("dialog[open]")].map((d) => ({
      width: d.clientWidth,
      scroll: d.scrollWidth,
    })),
  }));
  assert.ok(result.width <= result.viewport + 1, JSON.stringify(result));
  assert.ok(
    result.dialogs.every((d) => d.scroll <= d.width + 1),
    JSON.stringify(result),
  );
}
const views = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1194 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 720 },
};
try {
  for (const route of routes)
    for (const theme of ["light", "dark"])
      for (const [device, viewport] of Object.entries(views))
        await check(`${route}/${theme}/${device}`, async () => {
          await open(route, theme, viewport);
          await noOverflow();
          assert.ok(await frame.locator("h1").count());
          if (device !== "narrow")
            await page
              .locator("iframe")
              .screenshot({
                path: resolve(output, `${route}-${theme}-${device}.png`),
                animations: "disabled",
              });
        });
  await check("home filtering, pagination and repository check", async () => {
    await open();
    await frame
      .locator('[data-select="repo-filter"][data-value="attention"]')
      .click();
    assert.equal(await frame.locator(".repo-row").count(), 1);
    await frame
      .locator('[data-select="repo-filter"][data-value="all"]')
      .click();
    await frame.locator('[data-action="more-repos"]').click();
    assert.equal(await frame.locator(".repo-row").count(), 5);
    await frame.locator('[data-action="check-repo"]').click();
    await frame
      .locator("#repository-url")
      .fill("https://github.com/demo-studio/atlas");
    await frame.locator('[data-action="submit-repository"]').click();
    assert.equal(
      await frame.locator("#overlay h2").textContent(),
      "仓库可阅读",
    );
    await page.keyboard.press("Escape");
    assert.equal(await frame.locator("dialog[open]").count(), 0);
  });
  await check("dialog Escape returns focus to trigger", async () => {
    await open();
    const trigger = frame.locator('[data-action="check-repo"]');
    await trigger.click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    assert.equal(
      await trigger.evaluate((e) => e === document.activeElement),
      true,
    );
  });
  await check("Specs directory, source, raw and nested document", async () => {
    await open("specs", "dark", views.mobile);
    await frame.locator('[data-action="directory"]').click();
    await frame.locator('#overlay [data-doc="access"]').click();
    await frame.waitForFunction(() => location.hash.includes("doc=access"));
    assert.equal(
      await frame.locator(".document h1").textContent(),
      "身份与访问权限",
    );
    await frame.locator('[data-action="raw"]').click();
    assert.ok(
      (await frame.locator("#overlay .raw").textContent()).includes(
        "身份与访问权限",
      ),
    );
    await page.keyboard.press("Escape");
    await noOverflow();
  });
  await check(
    "Changes scopes, task board, detail keyboard tabs and nested focus",
    async () => {
      await open("changes");
      await frame
        .locator('[data-select="granularity"][data-value="tasks"]')
        .click();
      await frame.locator('[data-select="view"][data-value="board"]').click();
      assert.equal(await frame.locator(".board-col").count(), 4);
      await frame
        .locator('[data-select="granularity"][data-value="changes"]')
        .click();
      await frame.locator('[data-change="reading-context"]').click();
      await frame.locator("#detail-tab-overview").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await frame.locator("#detail-tab-tasks").getAttribute("aria-selected"),
        "true",
      );
      await frame.locator("#detail-tab-overview").click();
      await frame.locator("[data-open-doc]").click();
      assert.equal(await frame.locator("dialog[open]").count(), 2);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(30);
      assert.equal(await frame.locator("dialog[open]").count(), 1);
      assert.equal(
        await frame
          .locator("[data-open-doc]")
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Archived integration diff and limits on narrow phone",
    async () => {
      await open("changes", "dark", views.narrow);
      await frame
        .locator('[data-select="scope"][data-value="archived"]')
        .click();
      await frame.locator('[data-change="source-details"]').click();
      await frame.locator("#detail-tab-integration").click();
      await noOverflow();
      await frame.locator('[data-diff-file="1"]').click();
      assert.ok(
        (await frame.locator(".diff-view").textContent()).includes("rename"),
      );
      await frame.locator('[data-diff-file="2"]').click();
      assert.ok(
        (await frame.locator(".diff-view").textContent()).includes("二进制"),
      );
      await frame.locator('[data-diff-file="3"]').click();
      assert.ok(
        (await frame.locator(".diff-view").textContent()).includes("展示限制"),
      );
      await noOverflow();
      await page.screenshot({
        path: resolve(output, "integration-dark-narrow.png"),
      });
    },
  );
  await check(
    "Prototype card detail, canvas, share and anonymous boundary",
    async () => {
      await open("prototypes", "light", views.mobile);
      await frame.locator('[data-proto-detail="reading"]').click();
      assert.ok(
        (await frame.locator("#overlay").textContent()).includes("源码提交"),
      );
      await page.keyboard.press("Escape");
      await frame.locator('[data-preview="reading"]').click();
      await frame.waitForFunction(() => location.hash.includes("viewer"));
      await frame
        .locator('[data-select="device"][data-value="mobile"]')
        .click();
      await frame
        .locator('[data-select="demo-section"][data-value="records"]')
        .click();
      assert.equal(await frame.locator(".demo-body .doc-table").count(), 1);
      await frame.locator('[data-action="share-prototype"]').click();
      await frame.locator('[data-action="prepare-public"]').click();
      await frame.locator('[data-action="open-public"]').click();
      await frame.waitForFunction(() => location.hash.includes("public"));
      assert.equal(
        await frame
          .locator('.mobile-nav,.sidebar,[data-action="source"]')
          .count(),
        0,
      );
      await noOverflow();
    },
  );
  await check(
    "Canvas fits exact device dimensions without widening page",
    async () => {
      await open("prototypes", "dark", views.narrow);
      await frame.locator('[data-preview="reading"]').click();
      await frame
        .locator('[data-select="device"][data-value="mobile"]')
        .click();
      assert.equal(
        await frame.locator(".demo-canvas").evaluate((e) => e.style.width),
        "390px",
      );
      await frame.locator('[data-action="rotate"]').click();
      assert.equal(
        await frame.locator(".demo-canvas").evaluate((e) => e.style.width),
        "844px",
      );
      await frame.locator('[data-action="zoom"]').click();
      await noOverflow();
    },
  );
  await check(
    "Token add, deduplicate, workspace isolation and logout scope",
    async () => {
      await open("credentials");
      await frame.locator('[data-action="login"]').click();
      await frame.locator("#demo-token").fill("not-a-demo-token");
      await frame.locator('[data-action="submit-login"]').click();
      assert.ok(
        (await frame.locator("#login-error").textContent()).includes("只接受"),
      );
      await frame.locator("#demo-token").fill("demo");
      await frame.locator('[data-action="submit-login"]').click();
      await frame.waitForFunction(() => location.hash.includes("home"));
      await frame.locator("#review-page").selectOption("credentials");
      assert.equal(
        await frame.locator('[data-action="remove-token"]').count(),
        2,
      );
      await frame
        .locator('[data-action="switch-token"][data-token="demo-other"]')
        .click();
      await frame.locator("#review-page").selectOption("home");
      assert.equal(await frame.locator(".repo-row").count(), 2);
      await frame.locator("#review-page").selectOption("credentials");
      await frame.locator('[data-action="logout-all"]').click();
      await frame.locator('[data-action="confirm-logout-all"]').click();
      assert.equal(
        await frame.locator('[data-action="remove-token"]').count(),
        1,
      );
      assert.equal(
        await frame
          .locator('[data-action="switch-token"][data-token="demo"]')
          .count(),
        1,
      );
    },
  );
  await check("Failed identity switch retains current identity", async () => {
    await open("credentials", "light", views.desktop, "switch-error");
    await frame
      .locator('[data-action="switch-token"][data-token="demo-other"]')
      .click();
    assert.ok(
      (await frame.locator("#overlay").textContent()).includes("当前身份"),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await frame
        .locator('[data-action="switch-token"][data-token="demo-other"]')
        .count(),
      1,
    );
  });
  await check("Clipboard fallback and focus", async () => {
    await open("specs", "light", views.desktop, "copy-error");
    await frame.locator('[data-action="share-doc"]').click();
    assert.ok(
      (await frame.locator("#copy-value").inputValue()).includes("/specs"),
    );
    await page.keyboard.press("Escape");
    await noOverflow();
  });
  await check("Solid surface and reduced motion", async () => {
    await open("home", "dark");
    await frame.locator('[data-action="review"]').click();
    await frame.locator("#review-material").selectOption("solid");
    await frame.locator("#review-motion").check();
    await frame.locator('[data-action="apply-review"]').click();
    assert.equal(
      await frame.evaluate(() => document.documentElement.dataset.material),
      "solid",
    );
    assert.equal(
      await frame.evaluate(
        () =>
          getComputedStyle(document.querySelector(".shell")).transitionDuration,
      ),
      "0s",
    );
    assert.equal(
      await frame.evaluate(
        () => getComputedStyle(document.querySelector(".glass")).backdropFilter,
      ),
      "none",
    );
  });
  for (const [route, scenes] of Object.entries({
    home: [
      "loading",
      "empty",
      "no-match",
      "partial",
      "error",
      "offline",
      "denied",
      "expired",
    ],
    specs: ["empty", "offline", "denied"],
    changes: [
      "loading",
      "empty",
      "no-match",
      "source-error",
      "missing-material",
      "integration-error",
    ],
    prototypes: ["loading", "empty", "unpublished"],
    credentials: ["expired", "empty"],
    public: ["loading", "unpublished", "revoked", "error"],
  }))
    for (const scene of scenes)
      await check(`${route}/${scene}/mobile`, async () => {
        await open(route, "dark", views.narrow, scene);
        await noOverflow();
        if (scene === "denied")
          assert.equal(
            await frame.locator(".document h1,.repo-row").count(),
            0,
          );
      });
  await check("keyboard-only main navigation and touch entry", async () => {
    await open("home", "light", views.mobile);
    await frame.locator('.mobile-nav [data-route="specs"]').focus();
    await page.keyboard.press("Enter");
    await frame.waitForFunction(() => location.hash.includes("specs"));
    assert.equal(await frame.locator(".document h1").count(), 1);
    const box = await frame.locator('[data-action="directory"]').boundingBox();
    assert.ok(box.width >= 32 && box.height >= 32);
  });
  if (errors.length)
    failures.push({ name: "Browser errors", message: errors.join("; ") });
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify({ checks, failures, errors }, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      passed: checks.length,
      failed: failures.length,
      browserErrors: errors.length,
      output,
    },
    null,
    2,
  ),
);
if (failures.length || errors.length) process.exitCode = 1;
