import test from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import {
  prepare,
  register,
  recover,
  checkedPath,
  withLock,
  validateResult,
} from "../.agents/skills/spec-trail/prototype/scripts/publishing.mjs";
import {
  validateArtifact,
  validateManifest,
  validatePreviews,
} from "../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import { publishToDirectory } from "../.agents/skills/spec-trail/prototype/examples/filesystem-host.mjs";
const current = {
  id: "screen",
  title: "页面",
  sourcePath: "packages/prototype/src/screen.html",
  kind: "page",
  devices: ["pc-web"],
};
async function publication(t: { after: (f: () => unknown) => unknown }) {
  const f = await fixture();
  t.after(f.cleanup);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 1,
      protectedBranches: ["main"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
      },
    }),
  );
  await f.put(
    "packages/prototype/prototype.json",
    JSON.stringify({ schemaVersion: 1, entries: [current] }),
  );
  await f.put(current.sourcePath, "<!doctype html><button>ready</button>");
  await f.put(".gitignore", "packages/prototype/dist/\n");
  f.commit();
  f.git(["checkout", "-b", "change/publish-demo"]);
  await f.put(
    "docs/project/changes/publish-demo/change.json",
    JSON.stringify({
      schemaVersion: 1,
      id: "publish-demo",
      title: "发布",
      size: "small",
      status: "active",
      stage: "execution",
      branch: "change/publish-demo",
      confirmations: {},
      tasks: { T1: { title: "发布", status: "doing" } },
      closure: {},
    }),
  );
  f.commit();
  await f.put(
    "packages/prototype/dist/index.html",
    "<!doctype html><button>ready</button>",
  );
  const request = prepare(
    f.author,
    "packages/prototype/dist",
    [{ id: "screen", entryPath: "index.html" }],
    "https://example.test/project.git",
  );
  const result = publishToDirectory(
    request,
    join(f.root, "storage"),
    "https://static.example.test/previews/",
  );
  return { f, request, result };
}
test("host publication is idempotent and only complete results update current and Change references", async (t) => {
  const { f, request, result } = await publication(t);
  assert.deepEqual(
    publishToDirectory(
      request,
      join(f.root, "storage"),
      "https://static.example.test/previews/",
    ),
    result,
  );
  const file = join(f.author, "packages/prototype/prototype.json"),
    before = await readFile(file, "utf8");
  assert.throws(
    () =>
      register(f.author, {
        request,
        result: { ...result, entries: [] },
        change: "publish-demo",
      }),
    /Incomplete/,
  );
  assert.equal(await readFile(file, "utf8"), before);
  assert.throws(
    () =>
      validateResult(request, {
        schemaVersion: 1,
        status: "failed",
        requestId: request.requestId,
        code: "UPLOAD",
        message: "failed",
        retryable: true,
      }),
    /retained/,
  );
  register(f.author, { request, result, change: "publish-demo" });
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const state = JSON.parse(
    await readFile(
      join(f.author, "docs/project/changes/publish-demo/change.json"),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.entries[0].artifact, state.previews[0].artifact);
  assert.equal(state.previews[0].artifact.sourceCommit, request.sourceCommit);
  register(f.author, { request, result, change: "publish-demo" });
  assert.equal(JSON.parse(await readFile(file, "utf8")).entries.length, 1);
  // An immutable URL cannot be silently repointed to a new digest/version.
  f.commit();
  await f.put(
    "packages/prototype/dist/index.html",
    "<!doctype html><button>v2</button>",
  );
  const second = prepare(
    f.author,
    "packages/prototype/dist",
    request.entries,
    request.repository,
  );
  const secondResult = publishToDirectory(
    second,
    join(f.root, "storage"),
    "https://static.example.test/previews/",
  );
  assert.throws(
    () =>
      register(f.author, {
        request: second,
        result: { ...secondResult, entries: result.entries },
        change: "publish-demo",
      }),
    /immutable URL/,
  );
  register(f.author, { request: second, result: secondResult });
  assert.equal(
    JSON.parse(
      await readFile(
        join(f.author, "docs/project/changes/publish-demo/change.json"),
        "utf8",
      ),
    ).previews[0].artifact.url,
    result.entries[0].url,
  );
  assert.equal(
    await readFile(
      join(f.root, "storage", result.version, "index.html"),
      "utf8",
    ),
    "<!doctype html><button>ready</button>",
  );
});
test("Git fallback copies an independent Change snapshot and rejects symlinks and dirty source", async (t) => {
  const { f } = await publication(t);
  await f.put(
    "packages/prototype/preview/screen/index.html",
    "<!doctype html><button>snapshot</button>",
  );
  register(f.author, { gitEntry: "screen", change: "publish-demo" });
  await f.put(
    "packages/prototype/preview/screen/index.html",
    "<!doctype html><button>current</button>",
  );
  assert.equal(
    await readFile(
      join(
        f.author,
        "docs/project/changes/publish-demo/previews/screen/index.html",
      ),
      "utf8",
    ),
    "<!doctype html><button>snapshot</button>",
  );
  await symlink(join(f.root, "missing"), join(f.author, "escape"));
  assert.throws(() => checkedPath(f.author, "escape/output"), /Symbolic/);
  await f.put(current.sourcePath, "edited");
  assert.throws(
    () => register(f.author, { gitEntry: "screen", change: "publish-demo" }),
    /uncommitted/,
  );
});
test("strict contracts reject URL credentials, malformed thumbnails and mixed legacy fields", () => {
  const artifact = {
    type: "hosted",
    version: "v1",
    url: "https://static.example.test/v1/index.html",
    sourceCommit: "a".repeat(40),
    digest: `sha256:${"a".repeat(64)}`,
  };
  assert.deepEqual(validateArtifact(artifact), []);
  for (const url of [
    "http://example.test/",
    "javascript:alert(1)",
    "https://user:secret@example.test/",
    "https://example.test/?token=x",
  ])
    assert(validateArtifact({ ...artifact, url }).length);
  assert(
    validatePreviews([
      {
        ...current,
        sourcePath: undefined,
        path: "packages/prototype/preview/screen",
        artifact,
      },
    ]).length,
  );
  assert(
    validateManifest({ schemaVersion: 1, entries: [current, current] }).length,
  );
  assert.doesNotThrow(() =>
    validatePreviews([
      {
        id: "x",
        title: "x",
        kind: "page",
        devices: 42,
        artifact: {
          ...artifact,
          thumbnails: [{ url: "https://static.example.test/a.png" }],
        },
      },
    ]),
  );
});
test("interrupted registration recovery preserves later user edits", async (t) => {
  const { f } = await publication(t);
  const path = "packages/prototype/prototype.json",
    file = join(f.author, path),
    before = await readFile(file);
  const after = Buffer.from(JSON.stringify({ schemaVersion: 1, entries: [] }));
  const journal = join(f.author, ".git/spec-trail-prototype-transaction.json");
  await writeFile(
    journal,
    JSON.stringify({
      root: f.author,
      files: [
        {
          path,
          before: before.toString("base64"),
          after: after.toString("base64"),
        },
      ],
    }),
  );
  await writeFile(file, "user edit");
  assert.throws(() => recover(f.author), /newer edits/);
  await writeFile(file, after);
  recover(f.author);
  assert.deepEqual(await readFile(file), before);
});

test("staged hosted refs need no Git artifact and Git fallback survives semantic archive", async (t) => {
  const { f, request, result } = await publication(t);
  const run = (script: string, args: string[] = []) => {
    const r = spawnSync(process.execPath, [resolve(script), ...args], {
      cwd: f.author,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  };
  register(f.author, { request, result, change: "publish-demo" });
  f.git(["add", "."]);
  run(".agents/skills/spec-trail/setup/scripts/pre-commit.js");
  f.commit();
  await f.put(
    "packages/prototype/preview/screen/index.html",
    "<!doctype html><p>snapshot</p>",
  );
  register(f.author, { gitEntry: "screen", change: "publish-demo" });
  await f.put(
    "docs/project/changes/publish-demo/requirement.md",
    "# Fixture delivery",
  );
  f.commit();
  const stateScript = ".agents/skills/spec-trail/scripts/change.mjs";
  const command = (name: string, args: string[]) =>
    run(stateScript, [name, "--change", "publish-demo", ...args]);
  command("task-complete", [
    "--task",
    "T1",
    "--verification",
    "fixture checks",
  ]);
  command("verify", ["--result", "passed", "--summary", "fixture checks"]);
  command("accept", [
    "--mode",
    "agent",
    "--summary",
    "fixture acceptance",
    "--source",
    "fixture",
  ]);
  command("specs", ["--result", "not_needed", "--summary", "fixture"]);
  command("archive", ["--date", "2026-10-09", "--summary", "fixture"]);
  const archived = "docs/project/archive/2026-10-09-publish-demo";
  const state = JSON.parse(
    await readFile(join(f.author, archived, "change.json"), "utf8"),
  );
  assert.equal(state.previews[0].artifact.path, archived + "/previews/screen");
  assert.equal(
    await readFile(
      join(f.author, state.previews[0].artifact.path, "index.html"),
      "utf8",
    ),
    "<!doctype html><p>snapshot</p>",
  );
  f.commit();
  run(".agents/skills/spec-trail/prototype/scripts/archive.mjs", [
    "--change",
    "publish-demo",
    "--push",
  ]);
});

test("crashed publication retains lock evidence and recovers only after verified stale-lock cleanup", async (t) => {
  const { f } = await publication(t);
  const path = "packages/prototype/prototype.json";
  const file = join(f.author, path);
  const before = await readFile(file, "utf8");
  const after = before + "\n";
  const lock = join(f.author, ".git/spec-trail-state.lock");
  const journal = join(f.author, ".git/spec-trail-prototype-transaction.json");
  const moduleUrl = new URL(
    "../.agents/skills/spec-trail/prototype/scripts/publishing.mjs",
    import.meta.url,
  ).href;
  const crashed = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import { withLock } from ${JSON.stringify(moduleUrl)};
    import { writeFileSync } from "node:fs";
    withLock(${JSON.stringify(f.author)}, () => {
      writeFileSync(${JSON.stringify(journal)}, ${JSON.stringify(JSON.stringify({ root: f.author, files: [{ path, before: Buffer.from(before).toString("base64"), after: Buffer.from(after).toString("base64") }] }))});
      writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(after)});
      process.kill(process.pid, "SIGKILL");
    });
  `,
  ]);
  assert.equal(crashed.signal, "SIGKILL");
  const owner = JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
  assert.equal(owner.root, f.author);
  assert.equal(typeof owner.hostname, "string");
  assert(Number.isFinite(Date.parse(owner.startedAt)));
  assert.throws(() => recover(f.author), /confirmed stale lock/);
  assert.equal(await readFile(file, "utf8"), after);
  assert.throws(() => process.kill(owner.pid, 0), { code: "ESRCH" });
  await rm(lock, { recursive: true }); // Only this known-dead test child owned it.
  recover(f.author);
  assert.equal(await readFile(file, "utf8"), before);
  withLock(f.author, () => {
    assert.throws(() => recover(f.author), /Never remove an active/);
  });
});
