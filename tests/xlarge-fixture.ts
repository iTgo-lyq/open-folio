import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fixture } from "./fixture.ts";
import { completedChange } from "./integration-fixture.ts";

export async function xlargeFixture(integrationBranch = "develop") {
  const f = await fixture();
  if (integrationBranch !== "develop") {
    f.git(["branch", "-m", "develop", integrationBranch]);
    f.git(["push", "-u", "origin", integrationBranch]);
    f.git(["push", "origin", "--delete", "develop"]);
    f.project.integrationBranch = integrationBranch;
  }
  const parent = join(f.root, "parent"),
    child = join(f.root, "child");
  const at = (cwd: string, ...args: string[]) => f.git(args, cwd);
  const put = async (cwd: string, path: string, body: string) => {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), body);
  };
  const commit = (cwd: string) => {
    at(cwd, "add", ".");
    at(cwd, "commit", "-m", "Fixture delivery");
    at(cwd, "push", "origin", "HEAD");
    return at(cwd, "rev-parse", "HEAD");
  };
  const cli = (
    script: string,
    cwd: string,
    id: string,
    command: string,
    options: string[] = [],
    expected = 0,
    env = process.env,
  ) => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(`.agents/skills/spec-trail/scripts/${script}.mjs`),
        command,
        "--repo",
        cwd,
        "--change",
        id,
        ...options,
      ],
      { encoding: "utf8", env, timeout: 30_000 },
    );
    assert.equal(
      result.status,
      expected,
      `${command}: ${result.stderr}\n${result.stdout}`,
    );
    return expected ? result.stderr : JSON.parse(result.stdout);
  };
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch,
      releaseBranch: "main",
      checkForUpdates: false,
    }),
  );
  const state = (id: string) => ({
    schemaVersion: 1,
    id,
    title: id,
    size: "small",
    status: "active",
    stage: "requirement",
    branch: integrationBranch,
    confirmations: {},
    tasks: { T1: { title: "Deliver", status: "todo" } },
    closure: {},
  });
  const parentState = {
    ...state("parent"),
    size: "xlarge",
    stage: "technical",
    tasks: {},
    children: ["child", "second"],
    confirmations: {
      requirement: { at: "2026-10-18T00:00:00.000Z", summary: "Parent scope" },
    },
  };
  await f.put(
    "docs/project/changes/parent/change.json",
    JSON.stringify(parentState),
  );
  for (const id of ["parent", "child", "second"]) {
    if (id !== "parent")
      await f.put(
        `docs/project/changes/${id}/change.json`,
        JSON.stringify({ ...state(id), parent: "parent" }),
      );
    await f.put(`docs/project/changes/${id}/requirement.md`, "# Requirement\n");
  }
  await f.put("docs/project/changes/parent/technical.md", "# Technical\n");
  f.commit();
  cli("workspace", f.author, "parent", "handoff", [
    "--path",
    parent,
    "--branch",
    "feature/whole",
  ]);
  await put(parent, "parent-feature.txt", "Only in parent\n");
  commit(parent);
  const handoff = (extra: string[] = [], expected = 0) =>
    cli(
      "workspace",
      f.author,
      "child",
      "handoff",
      ["--path", child, "--branch", "feature/part", ...extra],
      expected,
    );
  const archiveChild = async () => {
    const record = {
      ...completedChange("child", "feature/part"),
      parent: "parent",
    };
    await rm(join(child, "docs/project/changes/child"), { recursive: true });
    await put(
      child,
      `${record.closure.archive.path}/change.json`,
      JSON.stringify(record),
    );
    await put(
      child,
      `${record.closure.archive.path}/requirement.md`,
      "# Child delivered\n",
    );
    await put(child, "child-feature.txt", "Delivered\n");
    return commit(child);
  };
  const mergeChild = () => {
    at(parent, "merge", "--no-ff", "feature/part", "-m", "Child delivery");
    at(parent, "push", "origin", "HEAD");
    const merge = at(parent, "rev-parse", "HEAD");
    const pr = f.recordMerge("child", "feature/part", merge);
    pr.base.branch = "feature/whole";
    return merge;
  };
  return {
    ...f,
    parent,
    child,
    at,
    putAt: put,
    commitAt: commit,
    cli,
    handoff,
    archiveChild,
    mergeChild,
  };
}
