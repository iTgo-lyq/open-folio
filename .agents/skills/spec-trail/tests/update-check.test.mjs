import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  CACHE_MS,
  UPDATE_URL,
  checkForUpdates,
} from "../scripts/update-check.mjs";
import { validateWorkflow } from "../scripts/state-schema.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "spec-trail-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const versionFile = join(root, "version.json"),
    common = join(root, "git");
  writeFileSync(versionFile, '{"version":"0.1.0"}');
  const repo = { common, config: {} },
    requests = [];
  const currentTime = 1700000000000;
  const check = (extra = {}) =>
    checkForUpdates(repo, {
      versionFile,
      now: () => currentTime,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return Response.json({ version: "0.1.1" });
      },
      ...extra,
    });
  return {
    root,
    versionFile,
    repo,
    requests,
    check,
    currentTime,
    cache: join(common, "spec-trail/update-check.json"),
  };
}

test("available notices cache only the remote version and compare the actual installation each time", async (t) => {
  const f = fixture(t);
  const result = await f.check();
  assert.equal(result.status, "available");
  assert.equal(result.currentVersion, "0.1.0");
  assert.equal(result.latestVersion, "0.1.1");
  assert.equal(f.requests[0].url, UPDATE_URL);
  assert.deepEqual(Object.keys(f.requests[0].options).sort(), [
    "redirect",
    "signal",
  ]);
  assert.equal(f.requests[0].options.redirect, "error");
  assert.equal((await f.check()).status, "available");
  assert.equal(f.requests.length, 1);
  writeFileSync(f.versionFile, '{"version":"0.1.1"}');
  assert.equal(await f.check(), undefined);
  writeFileSync(f.versionFile, '{"version":"1.0.0"}');
  assert.equal(await f.check(), undefined);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(f.cache, "utf8")), {
    checkedAt: f.currentTime,
    latestVersion: "0.1.1",
  });
});

test("project opt-out returns before inspecting installation or cache", async () => {
  const repo = {
    config: { checkForUpdates: false },
    get common() {
      throw Error("must not inspect cache");
    },
  };
  const result = await checkForUpdates(repo, {
    versionFile: "/nonexistent/version.json",
    fetchImpl: () => {
      throw Error("must not fetch");
    },
  });
  assert.equal(result, undefined);
  for (const value of [true, false])
    assert.deepEqual(
      validateWorkflow({
        schemaVersion: 3,
        integrationBranch: "develop",
        releaseBranch: "main",
        checkForUpdates: value,
      }),
      [],
    );
  for (const value of [null, "false", 0])
    assert(
      validateWorkflow({
        schemaVersion: 3,
        integrationBranch: "develop",
        releaseBranch: "main",
        checkForUpdates: value,
      }).length,
    );
});

test("unversioned or corrupt installations stay unknown without a request or cache", async (t) => {
  const f = fixture(t);
  for (const content of [undefined, "{", '{"version":"bad"}']) {
    rmSync(f.versionFile, { force: true });
    if (content) writeFileSync(f.versionFile, content);
    assert.equal((await f.check()).status, "unknown");
    assert.equal(f.requests.length, 0);
    assert(!existsSync(f.cache));
  }
});

test("invalid, expired and future caches are checked again", async (t) => {
  const f = fixture(t);
  mkdirSync(dirname(f.cache), { recursive: true });
  const values = [
    "{",
    "null",
    {},
    { checkedAt: f.currentTime - CACHE_MS, latestVersion: "9.0.0" },
    { checkedAt: f.currentTime + 1, latestVersion: "9.0.0" },
    { checkedAt: f.currentTime, latestVersion: "bad" },
    { checkedAt: f.currentTime, failed: "true", latestVersion: "9.0.0" },
  ];
  for (const [index, value] of values.entries()) {
    writeFileSync(
      f.cache,
      typeof value === "string" ? value : JSON.stringify(value),
    );
    assert.equal((await f.check()).latestVersion, "0.1.1");
    assert.equal(f.requests.length, index + 1);
  }
});

test("failed checks expire and do not reuse stale available notices", async (t) => {
  const f = fixture(t);
  await f.check();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw Error("offline");
  };
  const now = () => f.currentTime + CACHE_MS;
  assert.equal((await f.check({ now, fetchImpl })).status, "unknown");
  assert.equal((await f.check({ now, fetchImpl })).status, "unknown");
  assert.equal(calls, 1);
  assert.equal(
    (await f.check({ now: () => f.currentTime + 2 * CACHE_MS })).status,
    "available",
  );
});

test("HTTP, format and response-size failures are harmless and cached", async (t) => {
  for (const fetchImpl of [
    async () => {
      throw Error("offline");
    },
    async () => new Response("missing", { status: 404 }),
    async () => new Response(null, { status: 204 }),
    async () => new Response("{"),
    async () =>
      Response.json({ version: "bad", message: "remote text must not appear" }),
    async () => new Response(" ".repeat(16 * 1024 + 1)),
  ]) {
    const f = fixture(t);
    const result = await f.check({ fetchImpl });
    assert.equal(result.status, "unknown");
    assert(!result.message.includes("remote text"));
    assert.equal((await f.check()).status, "unknown");
    assert.equal(f.requests.length, 0);
  }
});

test("the same deadline covers waiting for headers and reading the response body", async (t) => {
  for (const body of [false, true]) {
    const f = fixture(t);
    const result = await f.check({
      timeoutMs: 15,
      fetchImpl: async (_url, { signal }) => {
        if (!body) {
          await delay(1000, undefined, { signal });
          return Response.json({ version: "0.1.1" });
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              const timer = setTimeout(() => controller.close(), 1000);
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer);
                  controller.error(signal.reason);
                },
                { once: true },
              );
            },
          }),
        );
      },
    });
    assert.equal(result.status, "unknown");
  }
});

test("oversized streams are cancelled and cache write failures retain a valid notice", async (t) => {
  const f = fixture(t);
  let cancelled = false;
  assert.equal(
    (
      await f.check({
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(16 * 1024 + 1));
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
      })
    ).status,
    "unknown",
  );
  assert(cancelled);
  const blocked = join(f.root, "blocked");
  writeFileSync(blocked, "not a directory");
  f.repo.common = blocked;
  assert.equal((await f.check()).status, "available");
});

function cliFixture(t, installFrom) {
  const f = fixture(t),
    repo = join(f.root, "project"),
    remote = join(f.root, "remote.git");
  const install = join(f.root, "installed-skill");
  if (!installFrom) {
    cpSync(fileURLToPath(new URL("../", import.meta.url)), install, {
      recursive: true,
    });
    writeFileSync(join(install, "version.json"), '{"version":"0.1.0"}');
  }
  const script = join(installFrom ?? install, "scripts/change.mjs");
  const configFile = join(repo, "docs/project/workflow.json"),
    stateFile = join(repo, "docs/project/changes/sample/change.json");
  const config = {
    schemaVersion: 3,
    integrationBranch: "develop",
    releaseBranch: "main",
  };
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(f.root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  const git = (directory, args) =>
    execFileSync("git", ["-C", directory, ...args], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(f.root, ["init", "--bare", "-b", "develop", remote]);
  git(f.root, ["init", "-b", "develop", repo]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  git(repo, ["remote", "add", "origin", remote]);
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(
    stateFile,
    JSON.stringify({
      schemaVersion: 1,
      id: "sample",
      title: "Example",
      size: "medium",
      status: "active",
      stage: "requirement",
      branch: "develop",
      confirmations: {},
      tasks: {},
      closure: {},
    }),
  );
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "Fixture"]);
  git(repo, ["push", "-u", "origin", "develop"]);
  const common = join(repo, ".git"),
    probe = join(f.root, "probe.jsonl"),
    preload = join(f.root, "fetch.mjs");
  writeFileSync(
    preload,
    `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  appendFileSync(process.env.SPEC_TRAIL_TEST_PROBE, JSON.stringify({ url, locked: existsSync(process.env.SPEC_TRAIL_TEST_LOCK), title: JSON.parse(readFileSync(process.env.SPEC_TRAIL_TEST_STATE, 'utf8')).title }) + '\\n');
  return Response.json({ version: '0.1.1' });
};\n`,
  );
  const run = (args, cwd = repo) =>
    spawnSync(process.execPath, ["--import", preload, script, ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...env,
        SPEC_TRAIL_TEST_PROBE: probe,
        SPEC_TRAIL_TEST_LOCK: join(common, "spec-trail-state.lock"),
        SPEC_TRAIL_TEST_STATE: stateFile,
      },
    });
  const probes = () =>
    existsSync(probe)
      ? readFileSync(probe, "utf8").trim().split("\n").map(JSON.parse)
      : [];
  return {
    ...f,
    repo,
    common,
    script,
    preload,
    install: installFrom ?? install,
    config,
    configFile,
    stateFile,
    git,
    run,
    probes,
    cache: join(common, "spec-trail/update-check.json"),
  };
}

test("CLI uses its actual installation and adds a notice only after the mutation and lock release", (t) => {
  const f = cliFixture(t);
  const result = f.run(["retitle", "--change", "sample", "--title", "Changed"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.state.title, "Changed");
  assert.equal(output.skillUpdate.currentVersion, "0.1.0");
  assert.equal(output.skillUpdate.latestVersion, "0.1.1");
  assert(
    !Object.hasOwn(
      JSON.parse(readFileSync(f.stateFile, "utf8")),
      "skillUpdate",
    ),
  );
  assert.deepEqual(f.probes(), [
    { url: UPDATE_URL, locked: false, title: "Changed" },
  ]);
  const subdirectory = join(f.repo, "nested");
  mkdirSync(subdirectory);
  const show = f.run(["show", "--change", "sample"], subdirectory);
  assert.equal(show.status, 0, show.stderr);
  assert.equal(JSON.parse(show.stdout).skillUpdate.status, "available");
  assert.equal(f.probes().length, 1);
  assert.equal(
    f.git(f.repo, ["status", "--porcelain"]),
    " M docs/project/changes/sample/change.json".trim(),
  );
});

test("CLI project opt-out and --repo select the right configuration for the same global installation", (t) => {
  const a = cliFixture(t);
  assert.equal(a.run(["show", "--change", "sample"]).status, 0);
  const cacheBefore = readFileSync(a.cache, "utf8"),
    mtime = statSync(a.cache).mtimeMs;
  writeFileSync(
    a.configFile,
    JSON.stringify({ ...a.config, checkForUpdates: false }),
  );
  const disabled = a.run(["show", "--change", "sample"]);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert(!Object.hasOwn(JSON.parse(disabled.stdout), "skillUpdate"));
  assert.equal(a.probes().length, 1);
  assert.equal(readFileSync(a.cache, "utf8"), cacheBefore);
  assert.equal(statSync(a.cache).mtimeMs, mtime);
  const b = cliFixture(t, a.install);
  const enabled = b.run(
    ["show", "--repo", b.repo, "--change", "sample"],
    b.root,
  );
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(JSON.parse(enabled.stdout).skillUpdate.status, "available");
  assert.equal(b.probes().length, 1);
});

test("CLI help, dry-run and failed operations do not fetch or create a cache", (t) => {
  const f = cliFixture(t);
  for (const [args, status] of [
    [["--help"], 0],
    [["retitle", "--change", "sample", "--title", "Preview", "--dry-run"], 0],
    [["show", "--change", "sample", "--dry-run"], 0],
    [["retitle", "--change", "sample"], 1],
    [["not-a-command"], 1],
  ]) {
    const result = f.run(args);
    assert.equal(result.status, status, result.stderr);
    assert.equal(f.probes().length, 0);
    assert(!existsSync(f.cache));
  }
  assert.equal(JSON.parse(readFileSync(f.stateFile, "utf8")).title, "Example");
});

test("CLI network failure keeps the completed mutation and successful exit status", (t) => {
  const f = cliFixture(t);
  writeFileSync(
    f.preload,
    'globalThis.fetch = async () => { throw Error("offline"); };\n',
  );
  const result = f.run([
    "retitle",
    "--change",
    "sample",
    "--title",
    "Saved offline",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.state.title, "Saved offline");
  assert.equal(output.skillUpdate.status, "unknown");
  assert.equal(
    JSON.parse(readFileSync(f.stateFile, "utf8")).title,
    "Saved offline",
  );
  assert(!existsSync(join(f.common, "spec-trail-state.lock")));
});

test("worktrees share a cache but their local opt-out still wins", (t) => {
  const f = cliFixture(t),
    worktree = join(f.root, "worktree");
  assert.equal(f.run(["show", "--change", "sample"]).status, 0);
  f.git(f.repo, ["worktree", "add", "-b", "change/other", worktree, "HEAD"]);
  const enabled = f.run(["show", "--change", "sample"], worktree);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(JSON.parse(enabled.stdout).skillUpdate.status, "available");
  assert.equal(f.probes().length, 1);
  writeFileSync(
    join(worktree, "docs/project/workflow.json"),
    JSON.stringify({ ...f.config, checkForUpdates: false }),
  );
  const disabled = f.run(["show", "--change", "sample"], worktree);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert(!Object.hasOwn(JSON.parse(disabled.stdout), "skillUpdate"));
  assert.equal(f.probes().length, 1);
});
