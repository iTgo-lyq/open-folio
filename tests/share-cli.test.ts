import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getShareLink } from "../.agents/skills/spec-trail/scripts/share.mjs";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "folio-share-cli-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  await mkdir(join(root, "docs/project"), { recursive: true });
  git("init", "-b", "develop");
  git("remote", "add", "origin", "git@github.com:acme/fixture.git");
  const configure = (openfolioUrl?: string) =>
    writeFile(
      join(root, "docs/project/workflow.json"),
      JSON.stringify({
        schemaVersion: 3,
        integrationBranch: "develop",
        releaseBranch: "main",
        ...(openfolioUrl ? { openfolioUrl } : {}),
      }),
    );
  await configure("https://folio.example.org");
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    git,
    configure,
    run: (extra: Record<string, unknown> = {}) =>
      getShareLink({ repo: root, change: "example", ...extra }),
  };
}

test("links locate the overview, document or prototype using encoded parameters", async (t) => {
  const f = await fixture(t);
  for (const [options, material] of [
    [{}, { ct: "overview" }],
    [
      { document: "notes/技术方案 #1.md" },
      { ct: "documents", document: "notes/技术方案 #1.md" },
    ],
    [{ preview: "screen" }, { ct: "previews", preview: "screen" }],
  ] as const) {
    const result = await f.run(options);
    const url = new URL(result.url);
    assert.equal(url.origin + url.pathname, "https://folio.example.org/share");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      repository: "https://github.com/acme/fixture",
      change: "example",
      integrationBranch: "develop",
      ...material,
    });
    assert.deepEqual(result, { url: url.href });
  }
});

test("unsafe document paths and service addresses are rejected locally", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ document: "../secret" }), /相对路径/);
  await f.configure("https://user:password@folio.example.org");
  await assert.rejects(f.run(), /openfolioUrl/);
  await f.configure();
  await assert.rejects(f.run(), /仓库材料链接/);
});

test("CLI returns a link from any working directory without contacting the service", async (t) => {
  const f = await fixture(t);
  await f.configure("https://unavailable.invalid");
  const script = fileURLToPath(
    new URL("../.agents/skills/spec-trail/cli.mjs", import.meta.url),
  );
  // This repository has no commits, Change documents or prototype artifacts.
  const output = execFileSync(
    process.execPath,
    [script, "share", "link", "--repo", f.root, "--change", "example", "--document", "requirement.md"],
    { cwd: tmpdir(), encoding: "utf8", timeout: 5_000 },
  );
  assert.deepEqual(JSON.parse(output), await f.run({ document: "requirement.md" }));
});

