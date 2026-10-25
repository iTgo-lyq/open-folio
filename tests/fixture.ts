import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { SnapshotStore } from "../src/server/store.ts";
import type { ProviderPullRequest } from "../src/server/providers/types.ts";
import type { DeliveryReader } from "../src/server/pull-requests.ts";
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
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
    }),
  );
  await put(
    "docs/project/specs/platform/spec.md",
    "# 平台\n\n中心仓库内容。\n\n## 重复\n一\n\n## 重复\n二\n",
  );
  commit();
  git(["checkout", "-b", "develop"]);
  git(["push", "-u", "origin", "develop"]);
  // Tests explicitly declare every central entry. This helper never discovers branches.
  const register = async (entries: Record<string, string>) => {
    const original = git(["branch", "--show-current"]);
    git(["checkout", "develop"]);
    for (const [id, branch] of Object.entries(entries)) {
      await put(
        `docs/project/changes/${id}/change.json`,
        JSON.stringify({
          schemaVersion: 1,
          id,
          title: id,
          branch,
          size: "small",
          status: "active",
          stage: "requirement",
          confirmations: {},
          tasks: {},
          closure: {},
        }),
      );
    }
    commit();
    git(["checkout", original]);
  };
  const pullRequests: ProviderPullRequest[] = [];
  const delivery: DeliveryReader = {
    repositoryId: "1",
    cacheKey: "fixture:1",
    list: async ({ base }) => ({
      items: pullRequests.filter((pr) => pr.base.branch === base),
      nextCursor: null,
    }),
  };
  const context = {
    delivery,
    signal: new AbortController().signal,
    beforePublish: async () => {},
  };
  const readPullRequests = async () => ({ repositoryId: "1", pullRequests });
  const recordMerge = (
    id: string,
    branch: string,
    commit = git(["rev-parse", "HEAD"]),
  ) => {
    const number = pullRequests.length + 1;
    const parents = git(["show", "-s", "--format=%P", commit]).split(" ");
    const pr: ProviderPullRequest = {
      number,
      title: `Deliver ${id}`,
      url: `https://github.com/demo/work/pull/${number}`,
      body: `Delivery\n\nSpecTrail-Change: ${id}`,
      state: "merged",
      draft: false,
      base: { repositoryId: "1", branch: "develop", commit: parents[0] },
      head: { repositoryId: "1", branch, commit: parents[1] ?? commit },
      mergeCommit: commit,
      updatedAt: "2026-10-25T00:00:00Z",
    };
    pullRequests.push(pr);
    return pr;
  };
  const project = {
    id: "fixture",
    integrationBranch: "develop",
    name: "测试项目",
    repositoryUrl: "https://example.test/fixture.git",
  };
  const makeStore = () =>
    new SnapshotStore(
      join(root, "cache"),
      (dir) => new GitReader(dir, remote, "file"),
      project.id,
    );
  return {
    root,
    pullRequests,
    delivery,
    context,
    readPullRequests,
    recordMerge,
    remote,
    author,
    project,
    git,
    put,
    commit,
    register,
    makeStore,
    store: makeStore(),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
