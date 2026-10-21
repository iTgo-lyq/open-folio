import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.ts";
import { completedChange } from "./integration-fixture.ts";
import { repository } from "../.agents/skills/spec-trail/scripts/repository.mjs";
import {
  verify,
  cleanup,
} from "../.agents/skills/spec-trail/scripts/integration.mjs";
import {
  inventory,
  retire,
} from "../.agents/skills/spec-trail/scripts/retire-archive-tags.mjs";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

test("archiving fixes a shared Git prototype before concurrent collaboration changes", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const id = "shared-preview",
    branch = `change/${id}`,
    live = `docs/project/changes/${id}`;
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
      prototype: {
        status: "enabled",
        packagePath: "prototype",
        hosting: { provider: "git" },
      },
    }),
  );
  await f.put("prototype/preview/page/index.html", "<html>ACCEPTED</html>");
  f.commit();
  await f.register({ [id]: branch });
  f.git(["checkout", "-b", branch]);
  const completed = completedChange(id),
    sourceCommit = f.git(["rev-parse", "HEAD"]);
  const { archive: ignored, ...closure } = completed.closure;
  await f.put(
    `${live}/change.json`,
    JSON.stringify({
      ...completed,
      status: "active",
      closure,
      previews: [
        {
          id: "page",
          title: "Shared page",
          kind: "page",
          devices: ["pc-web"],
          artifact: {
            type: "git",
            path: "prototype/preview/page",
            sourceCommit,
          },
        },
      ],
    }),
  );
  f.commit();
  const command = [
    resolve(".agents/skills/spec-trail/scripts/change.mjs"),
    "archive",
    "--repo",
    f.author,
    "--change",
    id,
    "--date",
    "2026-10-18",
    "--summary",
    "Archive shared preview",
  ];
  const before = await readFile(join(f.author, `${live}/change.json`), "utf8");
  execFileSync(process.execPath, [...command, "--dry-run"]);
  assert.equal(
    await readFile(join(f.author, `${live}/change.json`), "utf8"),
    before,
  );
  await assert.rejects(
    readFile(join(f.author, `${live}/previews/page/index.html`)),
    { code: "ENOENT" },
  );
  // Refuse to overwrite a different snapshot, leaving the live record intact.
  await f.put(`${live}/previews/page/index.html`, "existing snapshot");
  assert.throws(
    () => execFileSync(process.execPath, command, { stdio: "pipe" }),
    /destination differs/,
  );
  assert.equal(
    await readFile(join(f.author, `${live}/change.json`), "utf8"),
    before,
  );
  await f.put(`${live}/previews/page/index.html`, "<html>ACCEPTED</html>");
  // Remove the equal destination too, exercising the real copy path.
  const { rm } = await import("node:fs/promises");
  await rm(join(f.author, `${live}/previews`), { recursive: true });
  const failCopy = join(f.root, "fail-copy.mjs");
  await writeFile(
    failCopy,
    `
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const open = fs.openSync, write = fs.writeFileSync;
let snapshot;
fs.openSync = (path, ...args) => {
  const fd = open(path, ...args);
  if (String(path).endsWith('/previews/page/index.html')) snapshot = fd;
  return fd;
};
fs.writeFileSync = (file, content, ...args) => {
  if (file === snapshot) {
    write(file, content.subarray(0, 8), ...args);
    throw Object.assign(Error('ENOSPC: injected partial write'), {code: 'ENOSPC'});
  }
  return write(file, content, ...args);
};
syncBuiltinESMExports();
`,
  );
  assert.throws(
    () =>
      execFileSync(process.execPath, ["--import", failCopy, ...command], {
        stdio: "pipe",
      }),
    /ENOSPC/,
  );
  assert.equal(
    await readFile(join(f.author, `${live}/change.json`), "utf8"),
    before,
  );
  await assert.rejects(
    readFile(join(f.author, `${live}/previews/page/index.html`)),
    { code: "ENOENT" },
  );
  const archived = JSON.parse(
    execFileSync(process.execPath, command, { encoding: "utf8" }),
  ).state;
  assert.equal(
    archived.previews[0].artifact.path,
    `${completed.closure.archive.path}/previews/page`,
  );
  assert.equal(archived.previews[0].artifact.sourceCommit, sourceCommit);
  f.commit();
  f.git(["checkout", "develop"]);
  await f.put(
    "prototype/preview/page/index.html",
    "<html>CONCURRENT OTHER DELIVERY</html>",
  );
  f.commit();
  f.git([
    "merge",
    "--no-ff",
    branch,
    "-m",
    `Change PR\n\nSpecTrail-Change: ${id}`,
  ]);
  f.git(["push", "origin", "develop"]);
  const result = await verify(repository(f.author), id);
  assert.equal(result.integration.status, "found");
  assert.match(
    f.git([
      "show",
      `${result.integration.commit}:prototype/preview/page/index.html`,
    ]),
    /CONCURRENT OTHER DELIVERY/,
  );
  await f.store.refresh(f.project, DEFAULT_LIMITS);
  const preview = await f.store.preview(
    f.project,
    id,
    undefined,
    DEFAULT_LIMITS,
    undefined,
    "page",
  );
  assert.match(preview.html!, /ACCEPTED/);
  assert.doesNotMatch(preview.html!, /CONCURRENT/);
});

test("archive, merge, verified cleanup, cold diff/preview and exact legacy tag/cache retirement form one complete delivery", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const id = "complete-delivery",
    branch = `change/${id}`;
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
      prototype: {
        status: "enabled",
        packagePath: "prototype",
        hosting: { provider: "git" },
      },
    }),
  );
  f.commit();
  await f.register({ [id]: branch });
  f.git(["checkout", "-b", branch]);
  const live = `docs/project/changes/${id}`,
    sourceCommit = f.git(["rev-parse", "HEAD"]),
    completed = completedChange(id);
  const { archive: ignored, ...closure } = completed.closure;
  const entry = {
    id: "page",
    title: "Delivery page",
    kind: "page",
    devices: ["pc-web"],
    artifact: { type: "git", path: `${live}/previews/page`, sourceCommit },
  };
  await f.put(
    `${live}/change.json`,
    JSON.stringify({
      ...completed,
      status: "active",
      closure,
      previews: [entry],
    }),
  );
  await f.put(`${live}/requirement.md`, "# Complete delivery\n");
  await f.put(
    `${live}/previews/page/index.html`,
    "<!doctype html><html><head><meta charset=utf-8></head><body>Complete delivery</body></html>",
  );
  await f.put("src/feature.txt", "Complete change\n");
  f.commit();
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve(".agents/skills/spec-trail/scripts/change.mjs"),
        "archive",
        "--repo",
        f.author,
        "--change",
        id,
        "--date",
        "2026-10-18",
        "--summary",
        "Verified fixture delivery",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.match(result.next, /integration.mjs preflight/);
  f.commit();
  f.git(["checkout", "develop"]);
  const worktree = join(f.root, "source");
  f.git(["worktree", "add", worktree, branch]);
  f.git([
    "merge",
    "--no-ff",
    branch,
    "-m",
    `Change PR\n\nSpecTrail-Change: ${id}`,
  ]);
  f.git(["push", "origin", "develop"]);
  const repo = repository(f.author),
    delivery = await verify(repo, id),
    merge = delivery.integration.commit;
  f.git(["merge", "--ff-only", "origin/develop"]);
  const cleaned = await cleanup(repo, id, {
    idleWorktree: worktree,
    verifiedCommit: merge,
  });
  for (const value of Object.values(cleaned.cleanup))
    assert.equal((value as { status: string }).status, "cleaned");
  f.git(["tag", "spec-trail/archive-v2/old-light"]);
  f.git(["tag", "-a", "spec-trail/archive-v2/old-annotated", "-m", "old"]);
  f.git(["tag", "release-keep"]);
  f.git(["push", "origin", "--tags"]);
  const plan = inventory(repo);
  assert.equal(plan.refs.length, 2);
  await assert.rejects(retire(repo, plan), /Deploy and verify/);
  assert.equal((await retire(repo, plan, true)).complete, true);
  assert.equal((await retire(repo, plan, true)).complete, true);
  assert.ok(f.git(["ls-remote", "origin", "refs/tags/release-keep"]));
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS);
  const reader = await f.store.integration(f.project, id, snapshot.id),
    files = await reader.files();
  const feature = files.files.find((file) => file.path === "src/feature.txt")!;
  assert.equal(
    (await reader.file(feature.id)).lines.find((line) => line.kind === "add")
      ?.text,
    "Complete change",
  );
  assert.match(
    (
      await f.store.preview(
        f.project,
        id,
        merge,
        DEFAULT_LIMITS,
        undefined,
        "page",
      )
    ).html!,
    /Complete delivery/,
  );
  // Simulate one retired cache beside unrelated refs and persisted user data.
  const dir = f.store.directory(),
    cachedGit = join(dir, "git"),
    oldId = randomUUID();
  f.git(["update-ref", "refs/openfolio/archive-v2/old", merge], cachedGit);
  f.git(["update-ref", "refs/openfolio/keep", merge], cachedGit);
  await writeFile(
    join(dir, "snapshots", `${oldId}.json`),
    JSON.stringify({
      ...snapshot,
      id: oldId,
      cacheSchemaVersion: 5,
      archiveRefs: [{ id, commit: merge }],
      archivePins: {},
    }),
  );
  await writeFile(join(dir, "current"), oldId);
  const userData = join(f.root, "user-preferences.json");
  await writeFile(userData, "untouched");
  const rebuilt = await f.makeStore().refresh(f.project, DEFAULT_LIMITS);
  assert.notEqual(rebuilt.id, oldId);
  assert.equal(
    f.git(
      ["for-each-ref", "--format=%(refname)", "refs/openfolio/archive-v2/"],
      cachedGit,
    ),
    "",
  );
  assert.equal(f.git(["rev-parse", "refs/openfolio/keep"], cachedGit), merge);
  assert.ok(!(await readdir(join(dir, "snapshots"))).includes(`${oldId}.json`));
  assert.equal(await readFile(userData, "utf8"), "untouched");
  assert.match(
    (
      await f
        .makeStore()
        .preview(f.project, id, undefined, DEFAULT_LIMITS, undefined, "page")
    ).html!,
    /Complete delivery/,
  );
});

test("tag retirement retains concurrent ref changes and partial failures for a safe retry", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.git(["tag", "spec-trail/archive-v2/raced"]);
  f.git(["tag", "spec-trail/archive-v2/denied"]);
  f.git(["push", "origin", "--tags"]);
  const repo = repository(f.author),
    plan = inventory(repo),
    before = f.git(["rev-parse", "HEAD"]);
  await f.put("next.txt", "next");
  const next = f.commit();
  f.git(["tag", "-f", "spec-trail/archive-v2/raced", next]);
  f.git(["push", "--force", "origin", "refs/tags/spec-trail/archive-v2/raced"]);
  const git = repo.git;
  repo.git = (args) => {
    if (
      args[0] === "push" &&
      args.at(-1) === ":refs/tags/spec-trail/archive-v2/denied"
    )
      throw Error("Permission denied");
    return git(args);
  };
  const result = await retire(repo, plan, true);
  assert.equal(result.complete, false);
  assert.equal(
    result.results.find((item: { ref: string; remote: { status: string } }) =>
      item.ref.endsWith("/raced"),
    )?.remote.status,
    "retained",
  );
  assert.equal(
    result.results.find((item: { ref: string; remote: { status: string } }) =>
      item.ref.endsWith("/denied"),
    )?.remote.status,
    "failed",
  );
  assert.equal(
    f.git(["rev-parse", "refs/tags/spec-trail/archive-v2/denied"]),
    before,
  );
  repo.git = git;
  assert.equal((await retire(repo, inventory(repo), true)).complete, true);
  await assert.rejects(
    retire(
      repo,
      {
        ...plan,
        refs: [
          { ref: "refs/tags/release-keep", remote: before, local: before },
        ],
      },
      true,
    ),
    /Invalid/,
  );
});
