import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile, rm } from "node:fs/promises";
import { integrationFixture } from "./integration-fixture.ts";
import { repository } from "../.agents/skills/spec-trail/scripts/repository.mjs";
import {
  integrate,
  cleanup,
  preflight,
} from "../.agents/skills/spec-trail/scripts/integration.mjs";

async function setup() {
  const f = await integrationFixture();
  f.git(["checkout", "develop"]);
  const worktree = join(f.root, "source");
  f.git(["worktree", "add", worktree, f.branch]);
  return { ...f, worktree, repo: repository(f.author) };
}

test("delivery creates a merge even when fast-forwardable; cleanup and retry need no source", async () => {
  const f = await setup();
  try {
    assert.equal((await preflight(f.repo, f.id)).integration.status, "missing");
    const result = await integrate(f.repo, f.id);
    assert.equal(result.integration.status, "found");
    assert.equal(result.integration.base, f.base);
    assert.equal(result.integration.source, f.source);
    assert.equal(
      f
        .git(["show", "--format=%P", "--no-patch", result.integration.commit])
        .split(" ").length,
      2,
    );
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.integration.commit,
      idleWorktree: f.worktree,
    };
    const done = await cleanup(f.repo, f.id, options);
    assert.deepEqual(
      Object.values(done.cleanup).map((x) => (x as { status: string }).status),
      ["cleaned", "cleaned", "cleaned"],
    );
    assert.equal(
      (await integrate(f.repo, f.id)).integration.commit,
      result.integration.commit,
    );
    assert.deepEqual(
      Object.values((await cleanup(f.repo, f.id, options)).cleanup).map(
        (x) => (x as { status: string }).status,
      ),
      ["cleaned", "cleaned", "cleaned"],
    );
  } finally {
    await f.cleanup();
  }
});

test("an advancing collaboration tip rebuilds the unpublished candidate on the new first parent", async () => {
  const f = await setup();
  try {
    const git = f.repo.git;
    let advanced = "",
      attempts = 0;
    f.repo.git = (args) => {
      if (args[0] === "push" && args.at(-1)?.endsWith(":refs/heads/develop")) {
        attempts++;
        if (attempts === 1) {
          advanced = f.git([
            "commit-tree",
            `${f.base}^{tree}`,
            "-p",
            f.base,
            "-m",
            "Concurrent delivery",
          ]);
          f.git(["push", "origin", `${advanced}:refs/heads/develop`]);
        }
      }
      return git(args);
    };
    const result = await integrate(f.repo, f.id);
    assert.equal(attempts, 2);
    assert.equal(result.integration.base, advanced);
    assert.equal(result.integration.source, f.source);
    assert.match(
      f.git([
        "log",
        "--first-parent",
        "--format=%s",
        result.integration.commit,
      ]),
      /Concurrent delivery/,
    );
    assert.equal(
      f.git(["worktree", "list", "--porcelain"]).includes(".integration-"),
      false,
    );
  } finally {
    await f.cleanup();
  }
});

test("a lost successful push response is resolved from remote history without a duplicate merge", async () => {
  const f = await setup();
  try {
    const git = f.repo.git;
    let attempts = 0;
    f.repo.git = (args) => {
      const output = git(args);
      if (args[0] === "push" && args.at(-1)?.endsWith(":refs/heads/develop")) {
        attempts++;
        throw Error("Response lost");
      }
      return output;
    };
    const result = await integrate(f.repo, f.id);
    assert.equal(result.remoteVerified, true);
    assert.equal(attempts, 1);
    assert.equal(
      (await integrate(f.repo, f.id)).integration.commit,
      result.integration.commit,
    );
    assert.equal(attempts, 1);
  } finally {
    await f.cleanup();
  }
});

test("cleanup retains unknown ignored files, unsaved work, active dependencies and unconfirmed occupancy", async () => {
  const f = await setup();
  try {
    const result = await integrate(f.repo, f.id);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.integration.commit,
      idleWorktree: f.worktree,
    };
    const retained = async (pattern: RegExp, opts = options) => {
      const output = await cleanup(f.repo, f.id, opts);
      assert.equal(output.cleanup.remote.status, "retained");
      assert.match(output.cleanup.remote.reason, pattern);
      assert.ok(f.git(["ls-remote", "origin", `refs/heads/${f.branch}`]));
    };
    await retained(/sessions.*idle/, {
      verifiedCommit: result.integration.commit,
      idleWorktree: "",
    });
    await writeFile(join(f.worktree, "private.env"), "private");
    await retained(/unsaved or ignored/);
    await writeFile(join(f.author, ".git/info/exclude"), "private.env\n");
    await retained(/unsaved or ignored/);
    await rm(join(f.worktree, "private.env"));
    await writeFile(join(f.worktree, "feature.txt"), "unsaved");
    await retained(/unsaved or ignored/);
    f.git(["restore", "feature.txt"], f.worktree);
    await f.register({ "other-change": f.branch });
    await retained(/Another live\/cancelled/);
  } finally {
    await f.cleanup();
  }
});

test("cleanup protects new source commits and conditional remote deletion catches tip races", async () => {
  const f = await setup();
  try {
    const result = await integrate(f.repo, f.id);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.integration.commit,
      idleWorktree: f.worktree,
    };
    const later = f.git([
      "commit-tree",
      `${f.source}^{tree}`,
      "-p",
      f.source,
      "-m",
      "new source work",
    ]);
    f.git(["update-ref", `refs/heads/${f.branch}`, later]);
    const retained = await cleanup(f.repo, f.id, options);
    assert.equal(retained.cleanup.remote.status, "retained");
    assert.match(retained.cleanup.remote.reason, /Local source has new/);
    f.git(["update-ref", `refs/heads/${f.branch}`, f.source]);
    const git = f.repo.git;
    f.repo.git = (args) => {
      if (
        args[0] === "push" &&
        args.some((arg: string) => arg.startsWith("--force-with-lease="))
      )
        f.git(["push", "origin", `${later}:refs/heads/${f.branch}`]);
      return git(args);
    };
    const raced = await cleanup(f.repo, f.id, options);
    assert.equal(raced.cleanup.remote.status, "failed");
    assert.equal(raced.cleanup.worktree.status, "retained");
    assert.equal(f.git(["rev-parse", `refs/heads/${f.branch}`]), f.source);
  } finally {
    await f.cleanup();
  }
});

test("partial cleanup can resume after remote deletion without regenerating the integration", async () => {
  const f = await setup();
  try {
    const result = await integrate(f.repo, f.id);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.integration.commit,
      idleWorktree: f.worktree,
    };
    const git = f.repo.git;
    f.repo.git = (args) => {
      if (args[0] === "worktree" && args[1] === "remove")
        throw Error("Injected worktree failure");
      return git(args);
    };
    const partial = await cleanup(f.repo, f.id, options);
    assert.equal(partial.cleanup.remote.status, "cleaned");
    assert.equal(partial.cleanup.worktree.status, "failed");
    assert.equal(partial.cleanup.branch.status, "retained");
    f.repo.git = git;
    const resumed = await cleanup(f.repo, f.id, options);
    assert.equal(resumed.integration.commit, result.integration.commit);
    assert.deepEqual(
      Object.values(resumed.cleanup).map(
        (x) => (x as { status: string }).status,
      ),
      ["cleaned", "cleaned", "cleaned"],
    );
  } finally {
    await f.cleanup();
  }
});
