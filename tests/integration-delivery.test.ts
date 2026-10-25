import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile, readFile, rm } from "node:fs/promises";
import { integrationFixture } from "./integration-fixture.ts";
import { inspectIntegration } from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { repository } from "../.agents/skills/spec-trail/scripts/repository.mjs";
import {
  verify,
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

test("cleanup preserves modifications hidden by assume-unchanged and skip-worktree", async () => {
  for (const flag of ["assume-unchanged", "skip-worktree"]) {
    const f = await setup();
    try {
      f.merge();
      const result = await verify(f.repo, f.id, f.readPullRequests);
      f.git(["merge", "--ff-only", "origin/develop"]);
      f.git(["update-index", `--${flag}`, "feature.txt"], f.worktree);
      await writeFile(join(f.worktree, "feature.txt"), "UNSAVED USER WORK");
      assert.equal(
        f.git(
          [
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--ignored=matching",
          ],
          f.worktree,
        ),
        "",
      );
      const output = await cleanup(f.repo, f.id, {
        verifiedCommit: result.tip,
        idleWorktree: f.worktree,
      });
      assert.equal(output.cleanup.remote.status, "retained");
      assert.match(
        output.cleanup.remote.reason,
        /assume-unchanged or skip-worktree/,
      );
      assert.ok(f.git(["ls-remote", "origin", `refs/heads/${f.branch}`]));
      assert.equal(
        await readFile(join(f.worktree, "feature.txt"), "utf8"),
        "UNSAVED USER WORK",
      );
      assert.ok(f.git(["show-ref", "--verify", `refs/heads/${f.branch}`]));
    } finally {
      await f.cleanup();
    }
  }
});

test("delivery creates a merge even when fast-forwardable; cleanup and retry need no source", async () => {
  const f = await setup();
  try {
    assert.equal(
      (await preflight(f.repo, f.id, f.readPullRequests)).sourceIncluded,
      false,
    );
    f.merge();
    const result = await verify(f.repo, f.id, f.readPullRequests);
    assert.equal(result.sourceIncluded, true);
    assert.equal(result.source.remote, f.source);
    assert.equal(result.source.local, f.source);
    assert.equal(
      f.git(["show", "--format=%P", "--no-patch", result.tip]).split(" ")
        .length,
      2,
    );
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.tip,
      idleWorktree: f.worktree,
    };
    const done = await cleanup(f.repo, f.id, options);
    assert.deepEqual(
      Object.values(done.cleanup).map((x) => (x as { status: string }).status),
      ["cleaned", "cleaned", "cleaned"],
    );
    const absent = await verify(f.repo, f.id, f.readPullRequests);
    assert.equal(absent.sourceAbsent, true);
    assert.equal(absent.sourceIncluded, null);
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

test("PR preflight and verification never push, and verify follows the actual platform merge", async () => {
  const f = await setup();
  try {
    const git = f.repo.git;
    f.repo.git = (args) => {
      assert.notEqual(args[0], "push");
      return git(args);
    };
    const ready = await preflight(f.repo, f.id, f.readPullRequests);
    assert.ok("source" in ready);
    assert.ok("commit" in ready.source);
    assert.equal(ready.source.commit, f.source);
    assert.ok(!("mergeMessage" in ready));
    await assert.rejects(
      verify(f.repo, f.id, f.readPullRequests),
      /No verified Change PR integration/,
    );
    await f.put("concurrent.txt", "Concurrent delivery");
    const advanced = f.commit();
    const merged = f.merge();
    const result = await verify(f.repo, f.id, f.readPullRequests);
    assert.equal(result.source.remote, f.source);
    assert.notEqual(result.tip, advanced);
    assert.equal(result.tip, merged);
    assert.equal((await verify(f.repo, f.id, f.readPullRequests)).tip, merged);
  } finally {
    await f.cleanup();
  }
});

test("preflight requires the current archived source to be pushed", async () => {
  const f = await setup();
  try {
    f.git(["commit", "--allow-empty", "-m", "Not pushed"], f.worktree);
    await assert.rejects(
      preflight(f.repo, f.id, f.readPullRequests),
      /Push the archived source/,
    );
  } finally {
    await f.cleanup();
  }
});

test("cleanup retains unknown ignored files, unsaved work, active dependencies and unconfirmed occupancy", async () => {
  const f = await setup();
  try {
    f.merge();
    const result = await verify(f.repo, f.id, f.readPullRequests);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.tip,
      idleWorktree: f.worktree,
    };
    const retained = async (pattern: RegExp, opts = options) => {
      const output = await cleanup(f.repo, f.id, opts);
      assert.equal(output.cleanup.remote.status, "retained");
      assert.match(output.cleanup.remote.reason, pattern);
      assert.ok(f.git(["ls-remote", "origin", `refs/heads/${f.branch}`]));
    };
    await retained(/sessions.*idle/, {
      verifiedCommit: result.tip,
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
    f.merge();
    const result = await verify(f.repo, f.id, f.readPullRequests);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.tip,
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
    f.merge();
    const result = await verify(f.repo, f.id, f.readPullRequests);
    f.git(["merge", "--ff-only", "origin/develop"]);
    const options = {
      verifiedCommit: result.tip,
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
    assert.equal(resumed.tip, result.tip);
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

test("source verification and safe cleanup do not require a unique diff marker", async (t) => {
  for (const mode of ["missing", "ambiguous", "second-parent"]) {
    await t.test(mode, async () => {
      const f = await setup();
      try {
        let merge: string;
        if (mode === "missing") {
          f.git([
            "merge",
            "--no-ff",
            f.branch,
            "-m",
            "Delivered without a marker",
          ]);
          f.git(["push", "origin", "develop"]);
          merge = f.git(["rev-parse", "HEAD"]);
          f.recordMerge(f.id, f.branch, merge);
        } else {
          merge = f.merge();
          f.git([
            "checkout",
            "-b",
            "local-planning",
            mode === "second-parent" ? f.base : merge,
          ]);
          await f.put("planning.txt", "Local planning\n");
          f.commit(false);
          if (mode === "second-parent") {
            f.git(["merge", "--no-ff", merge, "-m", "Sync remote develop"]);
            const sync = f.git(["rev-parse", "HEAD"]);
            f.git(["checkout", "develop"]);
            f.git(["merge", "--ff-only", sync]);
            assert.ok(
              !f
                .git(["rev-list", "--first-parent", "HEAD"])
                .split("\n")
                .includes(merge),
            );
          } else {
            f.git(["checkout", "develop"]);
            f.git([
              "merge",
              "--no-ff",
              "local-planning",
              "-m",
              `Another merge\n\nSpecTrail-Change: ${f.id}`,
            ]);
          }
          f.git(["push", "origin", "develop"]);
        }
        const verified = await verify(f.repo, f.id, f.readPullRequests);
        assert.equal(verified.sourceIncluded, true);
        assert.equal(verified.integration.commit, merge);
        const diff = await inspectIntegration(f.run, merge, f.id);
        assert.equal(diff.status, "found");
        if (diff.status === "found") assert.equal(diff.commit, merge);
        // No history scan is allowed on the deletion path.
        const git = f.repo.git;
        f.repo.git = (args) => {
          assert.notEqual(args[0], "log");
          return git(args);
        };
        const cleaned = await cleanup(f.repo, f.id, {
          verifiedCommit: verified.tip,
          idleWorktree: f.worktree,
        });
        assert.deepEqual(
          Object.values(cleaned.cleanup).map(
            (item) => (item as { status: string }).status,
          ),
          ["cleaned", "cleaned", "cleaned"],
        );
      } finally {
        await f.cleanup();
      }
    });
  }
});

test("an existing unreadable local source ref cannot be mistaken for an absent source", async (t) => {
  const f = await setup();
  t.after(f.cleanup);
  const merged = f.merge();
  const refFile = join(f.author, ".git", "refs", "heads", f.branch);
  const dangling = "f".repeat(40);
  await writeFile(refFile, dangling + "\n");
  await assert.rejects(
    verify(f.repo, f.id, f.readPullRequests),
    /bad ref|bad object|reference/i,
  );
  await assert.rejects(
    cleanup(f.repo, f.id, { verifiedCommit: merged, idleWorktree: f.worktree }),
    /bad ref|bad object|reference/i,
  );
  assert.equal(await readFile(refFile, "utf8"), dangling + "\n");
  assert.ok(f.git(["ls-remote", "origin", `refs/heads/${f.branch}`]));
});
