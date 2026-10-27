import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { xlargeFixture } from "./xlarge-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

test("child handoff separates central registration and parent code; parent archive survives child deletion", async (t) => {
  const f = await xlargeFixture();
  t.after(f.cleanup);
  const preview = f.handoff(["--dry-run"]);
  assert.equal(preview.targetBranch, "feature/whole");
  const result = f.handoff();
  assert.equal(result.targetBranch, "feature/whole");
  assert.equal(
    await readFile(join(f.child, "parent-feature.txt"), "utf8"),
    "Only in parent\n",
  );
  assert.throws(() => f.git(["show", "develop:parent-feature.txt"]));
  assert.equal(f.handoff().commit, result.commit);
  await f.archiveChild();
  f.mergeChild();
  f.git(["push", "origin", "--delete", "feature/part"]);
  f.git(["worktree", "remove", f.child]);
  f.git(["branch", "-D", "feature/part"]);
  const shown = f.cli("change", f.author, "child", "show");
  assert.equal(shown.branch, "feature/whole");
  assert.equal(shown.state.branch, "feature/part");
  const snapshot = await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
  const child = snapshot.changes.find((c) => c.id === "child")!;
  assert.ok(child.primary, JSON.stringify(child.diagnostics));
  assert.equal(child.candidates[0].branch, "feature/whole");
  assert.equal(child.candidates[0].validCompleted, true);
});

test("child handoff retries a failed central publication without publishing parent implementation", async (t) => {
  const f = await xlargeFixture();
  t.after(f.cleanup);
  const hook = join(f.remote, "hooks/pre-receive");
  await writeFile(
    hook,
    '#!/bin/sh\nwhile read old new ref; do\n if [ "$ref" = "refs/heads/develop" ]; then exit 1; fi\ndone\n',
    { mode: 0o755 },
  );
  f.handoff([], 1);
  await writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  f.handoff();
  assert.throws(() => f.git(["show", "origin/develop:parent-feature.txt"]));
  assert.equal(
    f.cli("change", f.author, "child", "show").state.branch,
    "feature/part",
  );
});
