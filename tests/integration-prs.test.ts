import test from "node:test";
import assert from "node:assert/strict";
import { integrationFixture } from "./integration-fixture.ts";
import { githubWire } from "./github-cli-fixture.ts";
import {
  changePullRequests,
  integrationEvidence,
  inspectIntegration,
} from "../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { githubPullRequests } from "../.agents/skills/spec-trail/scripts/github-prs.mjs";
import { verify } from "../.agents/skills/spec-trail/scripts/integration.mjs";
import { repository } from "../.agents/skills/spec-trail/scripts/repository.mjs";

test("only a uniquely associated merged PR proves delivery; messages and wrong identities do not", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  const m = f.merge(),
    pr = f.pullRequests[0];
  const match = (prs = [pr]) =>
    changePullRequests(prs, {
      repositoryId: "1",
      integrationBranch: "develop",
      id: f.id,
      branch: f.branch,
    });
  const ancestor = async (a: string, b: string) =>
    f.git(["merge-base", a, b]) === a;
  const resolve = (prs = [pr]) => integrationEvidence(ancestor, m, match(prs));
  assert.deepEqual(await resolve(), { status: "found", commit: m });
  assert.equal((await inspectIntegration(f.run, m, f.id)).status, "found");
  for (const patch of [
    { state: "closed" as const },
    { state: "open" as const },
    { body: "Mention SpecTrail-Change: example" },
    { body: "PR\n\nSpecTrail-Change: example\nSpecTrail-Change: example" },
    { head: { ...pr.head, repositoryId: "2" } },
    { head: { ...pr.head, branch: "other" } },
    { base: { ...pr.base, repositoryId: "2" } },
    { base: { ...pr.base, branch: "main" } },
  ])
    assert.equal((await resolve([{ ...pr, ...patch }])).status, "missing");
  assert.equal((await resolve([pr, { ...pr, number: 2 }])).status, "invalid");
  assert.equal(
    (await resolve([{ ...pr, mergeCommit: null }])).status,
    "unavailable",
  );
  assert.equal(
    (await integrationEvidence(ancestor, f.base, [pr])).status,
    "unavailable",
  );
  assert.equal(
    (
      await integrationEvidence(
        async () => {
          throw Error("missing object");
        },
        m,
        [pr],
      )
    ).status,
    "unavailable",
  );
  f.pullRequests.length = 0;
  await assert.rejects(
    verify(repository(f.author), f.id, f.readPullRequests),
    /No verified Change PR/,
  );
});

test("formal PR integration remains provable when a merge diff cannot be displayed", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.git(["checkout", "develop"]);
  f.git(["merge", "--ff-only", f.branch]);
  f.git(["push", "origin", "develop"]);
  f.recordMerge(f.id, f.branch, f.source);
  assert.equal(
    (await verify(repository(f.author), f.id, f.readPullRequests)).integration
      .commit,
    f.source,
  );
  assert.equal(
    (await inspectIntegration(f.run, f.source, f.id)).status,
    "invalid",
  );
});

test("GitHub adapter reads every page, distinguishes closed from merged and fails on partial data", async (t) => {
  const f = await integrationFixture();
  t.after(f.cleanup);
  f.merge();
  const raw = githubWire(f.pullRequests[0]);
  const repo = { git: () => "git@github.com:demo/work.git" };
  const calls: string[][] = [];
  const request = async (args: string[]) => {
    calls.push(args);
    if (args.at(-1) === "repos/demo/work")
      return JSON.stringify({ id: 1, full_name: "demo/work" });
    const page = new URL(`https://github.test/${args.at(-1)}`).searchParams.get(
      "page",
    );
    return JSON.stringify(
      page === "1"
        ? Array.from({ length: 100 }, (_, i) => ({
            ...raw,
            number: i + 1,
            merged_at: null,
          }))
        : [{ ...raw, number: 101 }],
    );
  };
  const result = await githubPullRequests(repo, "develop", request);
  assert.equal(result.pullRequests.length, 101);
  assert.equal(result.pullRequests[0].state, "closed");
  assert.equal(result.pullRequests[0].mergeCommit, null);
  assert.equal(result.pullRequests[100].state, "merged");
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (args) =>
        args[0] === "api" &&
        args[1] === "--hostname" &&
        args[2] === "github.com",
    ),
  );
  await assert.rejects(
    githubPullRequests(repo, "develop", async (args: string[]) => {
      if (args.at(-1)?.endsWith("page=2")) throw Error("network");
      return request(args);
    }),
    /PR records unavailable/,
  );
  await assert.rejects(
    githubPullRequests(repo, "develop", async (args: string[]) =>
      args.at(-1) === "repos/demo/work"
        ? JSON.stringify({ id: 1, full_name: "demo/work" })
        : JSON.stringify([{ ...raw, merged_at: undefined }]),
    ),
    /Incomplete/,
  );
});
