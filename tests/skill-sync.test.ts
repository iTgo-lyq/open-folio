import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const script = resolve("scripts/sync-spec-trail.sh");
const run = (cwd: string, command: string, args: string[]) => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(command, args, { cwd, encoding: "utf8", env });
};
const git = (cwd: string, args: string[]) => {
  const result = run(cwd, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const put = (root: string, path: string, body: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
};
function fixture(t: { after: (cleanup: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "spec trail sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source"),
    distribution = join(root, "distribution"),
    remote = join(root, "remote.git");
  git(root, ["init", "--bare", "-b", "main", remote]);
  git(root, ["init", "-b", "main", source]);
  git(root, ["clone", remote, distribution]);
  for (const repo of [source, distribution]) {
    git(repo, ["config", "user.name", "Fixture"]);
    git(repo, ["config", "user.email", "fixture@example.invalid"]);
    git(repo, ["config", "core.hooksPath", "/dev/null"]);
  }
  put(source, ".agents/skills/spec-trail/SKILL.md", "# Current skill\n");
  for (const file of ["scripts/version.mjs", "tests/version.test.mjs"]) {
    const target = join(source, ".agents/skills/spec-trail", file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(".agents/skills/spec-trail", file), target);
  }
  put(
    source,
    ".agents/skills/spec-trail/setup/tests/setup.test.mjs",
    'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.match(readFileSync(new URL("../../SKILL.md", import.meta.url), "utf8"), /Current skill/);\n',
  );
  git(source, ["add", "."]);
  git(source, ["commit", "-m", "Source skill"]);
  const sourceCommit = git(source, ["rev-parse", "HEAD"]);
  put(distribution, "README.md", "Distribution instructions\n");
  put(distribution, "LICENSE", "Repository license\n");
  put(distribution, "skills/spec-trail/LICENSE", "Distribution license\n");
  put(distribution, "skills/spec-trail/stale.md", "Remove this stale file\n");
  put(distribution, "skills/another-skill/SKILL.md", "Independent skill\n");
  git(distribution, ["add", "."]);
  git(distribution, ["commit", "-m", "Distribution baseline"]);
  git(distribution, ["push", "-u", "origin", "main"]);
  return {
    root,
    source,
    distribution,
    remote,
    sourceCommit,
    sync: (target = distribution) =>
      run(root, "bash", [script, source, target]),
  };
}

test("skill sync publishes committed files, removes stale files, preserves distribution files and skips unchanged runs", (t) => {
  const f = fixture(t);
  put(f.source, ".agents/skills/spec-trail/SKILL.md", "Uncommitted edit\n");
  put(f.source, ".agents/skills/spec-trail/local-only.txt", "Local draft\n");
  const result = f.sync();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    git(f.remote, ["show", "main:skills/spec-trail/SKILL.md"]),
    "# Current skill",
  );
  const paths = git(f.remote, ["ls-tree", "-r", "--name-only", "main"]);
  assert.equal(
    JSON.parse(git(f.remote, ["show", "main:skills/spec-trail/version.json"]))
      .version,
    "0.1.0",
  );
  assert(!existsSync(join(f.source, ".agents/skills/spec-trail/version.json")));
  assert(!paths.includes("stale.md"));
  assert(!paths.includes("local-only.txt"));
  for (const [path, content] of [
    ["README.md", "Distribution instructions"],
    ["LICENSE", "Repository license"],
    ["skills/spec-trail/LICENSE", "Distribution license"],
    ["skills/another-skill/SKILL.md", "Independent skill"],
  ])
    assert.equal(git(f.remote, ["show", `main:${path}`]), content);
  const published = git(f.remote, ["rev-parse", "main"]);
  assert(
    git(f.remote, ["log", "-1", "--format=%B", "main"]).includes(
      f.sourceCommit,
    ),
  );
  assert.equal(git(f.distribution, ["status", "--porcelain"]), "");
  const again = f.sync();
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already matches/);
  assert.equal(git(f.remote, ["rev-parse", "main"]), published);
  put(f.source, "README.md", "Unrelated source change\n");
  git(f.source, ["add", "README.md"]);
  git(f.source, ["commit", "-m", "Unrelated source change"]);
  assert.equal(f.sync().status, 0);
  assert.equal(git(f.remote, ["rev-parse", "main"]), published);
});

test("skill sync increments a patch only when committed skill content changes", (t) => {
  const f = fixture(t);
  assert.equal(f.sync().status, 0);
  put(
    f.distribution,
    "skills/spec-trail/version.json",
    '{"version":"0.1.9"}\n',
  );
  git(f.distribution, ["add", "."]);
  git(f.distribution, ["commit", "-m", "Prior release"]);
  git(f.distribution, ["push", "origin", "main"]);
  put(
    f.source,
    ".agents/skills/spec-trail/SKILL.md",
    "# Current skill updated\n",
  );
  git(f.source, ["add", "."]);
  git(f.source, ["commit", "-m", "Change skill"]);
  const result = f.sync();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    JSON.parse(git(f.remote, ["show", "main:skills/spec-trail/version.json"]))
      .version,
    "0.1.10",
  );
  assert.match(
    git(f.remote, ["show", "main:skills/spec-trail/SKILL.md"]),
    /updated/,
  );
  const published = git(f.remote, ["rev-parse", "main"]);
  assert.equal(f.sync().status, 0);
  assert.equal(git(f.remote, ["rev-parse", "main"]), published);
});

test("first version is published even when skill content already matches", (t) => {
  const f = fixture(t);
  cpSync(
    join(f.source, ".agents/skills/spec-trail"),
    join(f.distribution, "skills/spec-trail"),
    { recursive: true },
  );
  rmSync(join(f.distribution, "skills/spec-trail/stale.md"));
  git(f.distribution, ["add", "."]);
  git(f.distribution, ["commit", "-m", "Unversioned matching content"]);
  git(f.distribution, ["push", "origin", "main"]);
  assert.equal(f.sync().status, 0);
  assert.equal(
    JSON.parse(git(f.remote, ["show", "main:skills/spec-trail/version.json"]))
      .version,
    "0.1.0",
  );
});

test("invalid published metadata stops before changing distribution content", (t) => {
  const f = fixture(t);
  put(f.distribution, "skills/spec-trail/version.json", '{"version":"bad"}');
  git(f.distribution, ["add", "."]);
  git(f.distribution, ["commit", "-m", "Invalid metadata"]);
  git(f.distribution, ["push", "origin", "main"]);
  const before = git(f.remote, ["rev-parse", "main"]);
  const result = f.sync();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid SpecTrail version/);
  assert.equal(git(f.remote, ["rev-parse", "main"]), before);
  assert.equal(git(f.distribution, ["status", "--porcelain"]), "");
});

test("failed pushes do not consume a release number when a fresh CI checkout retries", (t) => {
  const f = fixture(t);
  assert.equal(f.sync().status, 0);
  const before = git(f.remote, ["rev-parse", "main"]);
  put(
    f.source,
    ".agents/skills/spec-trail/SKILL.md",
    "# Current skill after retry\n",
  );
  git(f.source, ["add", "."]);
  git(f.source, ["commit", "-m", "Next release"]);
  const hook = join(f.remote, "hooks/pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  assert.notEqual(f.sync().status, 0);
  assert.equal(git(f.remote, ["rev-parse", "main"]), before);
  rmSync(hook);
  const retry = join(f.root, "retry");
  git(f.root, ["clone", f.remote, retry]);
  const result = f.sync(retry);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    JSON.parse(git(f.remote, ["show", "main:skills/spec-trail/version.json"]))
      .version,
    "0.1.1",
  );
});

test("skill sync refuses a dirty distribution checkout", (t) => {
  const f = fixture(t);
  const before = git(f.remote, ["rev-parse", "main"]);
  put(f.distribution, "README.md", "Local distribution edits\n");
  const result = f.sync();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be clean/);
  assert.equal(git(f.remote, ["rev-parse", "main"]), before);
  assert.equal(
    git(f.distribution, ["show", "HEAD:skills/spec-trail/stale.md"]),
    "Remove this stale file",
  );
});

test("skill sync does not publish when the exported skill fails validation", (t) => {
  const f = fixture(t);
  const before = git(f.remote, ["rev-parse", "main"]);
  put(
    f.source,
    ".agents/skills/spec-trail/setup/tests/setup.test.mjs",
    'throw new Error("Skill validation failed");\n',
  );
  git(f.source, ["add", "."]);
  git(f.source, ["commit", "-m", "Invalid skill"]);
  const result = f.sync();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(f.remote, ["rev-parse", "main"]), before);
});

test("skill sync also requires the exported skill self-tests to pass", (t) => {
  const f = fixture(t);
  const before = git(f.remote, ["rev-parse", "main"]);
  put(
    f.source,
    ".agents/skills/spec-trail/tests/broken.test.mjs",
    'throw Error("New skill self-test failed");\n',
  );
  git(f.source, ["add", "."]);
  git(f.source, ["commit", "-m", "Fail a self-test"]);
  const result = f.sync();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /New skill self-test failed/);
  assert.equal(git(f.remote, ["rev-parse", "main"]), before);
});
