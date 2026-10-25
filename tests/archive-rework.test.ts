import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { githubCli } from "./github-cli-fixture.ts";
import { integrationFixture } from "./integration-fixture.ts";
const cli = resolve(".agents/skills/spec-trail/scripts/change.mjs");
const restore = (repo: string, env = process.env) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        "rework",
        "--repo",
        repo,
        "--change",
        "example",
        "--stage",
        "execution",
        "--reason",
        "PR feedback",
        "--approach",
        "Repair then validate",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env },
    ),
  );

test("an unintegrated archive restores its documents and Git prototype for PR repair", async () => {
  const f = await integrationFixture();
  try {
    const path = `${f.archivePath}/previews/page`;
    const record = {
      ...f.record,
      previews: [
        {
          id: "page",
          title: "Page",
          kind: "page",
          devices: ["pc-web"],
          artifact: { type: "git", path, sourceCommit: f.source },
        },
      ],
    };
    await f.put(`${path}/index.html`, "<html>Accepted prototype</html>");
    await f.put(`${f.archivePath}/change.json`, JSON.stringify(record));
    f.commit();
    const result = restore(f.author, await githubCli(f));
    assert.equal(result.state.status, "active");
    assert.equal(result.state.stage, "execution");
    assert.deepEqual(result.state.closure, {});
    assert.equal(result.state.tasks.T1.status, "done");
    assert.equal(
      result.state.previews[0].artifact.path,
      "docs/project/changes/example/previews/page",
    );
    assert.match(
      await readFile(
        join(f.author, "docs/project/changes/example/previews/page/index.html"),
        "utf8",
      ),
      /Accepted prototype/,
    );
    await assert.rejects(
      readFile(join(f.author, `${f.archivePath}/change.json`)),
      { code: "ENOENT" },
    );
  } finally {
    await f.cleanup();
  }
});

test("an integrated archive cannot be restored, including an unmarked merge", async () => {
  for (const marked of [true, false]) {
    const f = await integrationFixture();
    try {
      if (marked) f.merge();
      else {
        f.git(["checkout", "develop"]);
        f.git(["merge", "--no-ff", f.branch, "-m", "Unmarked merge"]);
        f.git(["push", "origin", "develop"]);
      }
      f.git(["checkout", f.branch]);
      assert.throws(
        () => restore(f.author),
        /read-only|registered Change branch/,
      );
      assert.equal(
        JSON.parse(
          await readFile(
            join(f.author, `${f.archivePath}/change.json`),
            "utf8",
          ),
        ).status,
        "completed",
      );
    } finally {
      await f.cleanup();
    }
  }
});
