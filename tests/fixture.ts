import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { SnapshotStore } from "../src/server/store.ts";
import { GitReader } from "../src/server/git.ts";
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openfolio-test-")),
    remote = join(root, "remote.git"),
    author = join(root, "author");
  const git = (args: string[], cwd = author) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  await mkdir(author);
  git(["init", "--bare", "--initial-branch=main", remote]);
  git(["init", "--initial-branch=main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["remote", "add", "origin", remote]);
  const put = async (path: string, body: string | Buffer) => {
    const target = join(author, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, body);
  };
  const commit = (push = true) => {
    git(["add", "."]);
    git(["commit", "-m", "fixture"]);
    if (push) git(["push", "-u", "origin", "HEAD"]);
    return git(["rev-parse", "HEAD"]);
  };
  await put(
    "docs/project/workflow.json",
    JSON.stringify({ schemaVersion: 1, protectedBranches: ["main"] }),
  );
  await put(
    "docs/project/specs/platform/spec.md",
    "# 平台\n\n中心仓库内容。\n\n## 重复\n一\n\n## 重复\n二\n",
  );
  commit();
  const project = {
    id: "fixture",
    name: "测试项目",
    repositoryUrl: "https://example.test/fixture.git",
  };
  const makeStore = () =>
    new SnapshotStore(
      join(root, "cache"),
      (dir) => new GitReader(dir, remote, "file"),
    );
  return {
    root,
    remote,
    author,
    project,
    git,
    put,
    commit,
    makeStore,
    store: makeStore(),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
