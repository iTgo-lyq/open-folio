import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  validBranchName,
  routeCatalog,
} from "../.agents/skills/spec-trail/scripts/routing.mjs";
import { validateWorkflow } from "../.agents/skills/spec-trail/scripts/state-schema.mjs";
import { workflowCoreSchema, workflowSchema } from "../src/server/schema.ts";

const workflow = {
  schemaVersion: 3,
  integrationBranch: "develop",
  releaseBranch: "main",
};
const at = "2026-10-18T00:00:00.000Z";
const archived = (id: string) => ({
  id,
  branch: `change/${id}`,
  status: "completed",
  stage: "close",
  tasks: {},
  closure: {
    verification: { result: "passed", at },
    acceptance: { result: "accepted", at },
    specs: { result: "synced", at },
    archive: {
      result: "done",
      at,
      path: `docs/project/archive/2026-10-18-${id}`,
    },
  },
});
test("branch routing rejects Git option/ref ambiguity and matches real branch syntax", () => {
  for (const name of [
    "develop",
    "feature/a",
    "团队/开发",
    "a-b.c",
    "-delete",
    ".hidden",
    "a/.hidden",
    "a..b",
    "foo.lock",
    "foo.lock/bar",
    "x//y",
    "x/",
    "x\\y",
    "refs/heads/x",
    "origin/main",
    "x\u007f",
    "@",
    "HEAD",
    "a@{b",
    "x*",
    "x:y",
  ]) {
    let gitValid = true;
    try {
      execFileSync("git", ["check-ref-format", "--branch", name], {
        stdio: "ignore",
      });
    } catch {
      gitValid = false;
    }
    assert.equal(
      validBranchName(name),
      gitValid && name !== "@" && !/^(refs|origin)\//.test(name),
      name,
    );
  }
});
test("workflow version 3 routing is shared and legacy configurations are rejected", () => {
  const samples = [
    workflow,
    { ...workflow, integrationBranch: "planning" },
    { ...workflow, integrationBranch: "main" },
    { ...workflow, integrationBranch: "../x" },
    { ...workflow, releaseBranch: [] },
    { ...workflow, releaseBranch: "../invalid" },
    { ...workflow, releaseBranch: "develop" },
    { ...workflow, schemaVersion: 1 },
    { schemaVersion: 1, releaseBranch: "main" },
    { ...workflow, extra: true },
  ];
  for (const sample of samples) {
    assert.equal(
      workflowSchema.safeParse(sample).success,
      validateWorkflow(sample).length === 0,
      JSON.stringify(sample),
    );
  }
  for (const legacy of [
    {
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["main"],
    },
    { schemaVersion: 1, releaseBranch: "main" },
    { ...workflow, schemaVersion: 1 },
  ]) {
    assert.match(
      validateWorkflow(legacy).join("\n"),
      /(?:version 3|schemaVersion)/,
    );
    assert(!workflowCoreSchema.safeParse(legacy).success);
    assert(!workflowSchema.safeParse(legacy).success);
  }
  assert(
    workflowCoreSchema.safeParse({
      ...workflow,
      prototype: { status: "broken" },
    }).success,
  );
  assert(
    !workflowSchema.safeParse({ ...workflow, prototype: { status: "broken" } })
      .success,
  );
});
test("catalog routes by branch without trusting stale progress, and integrated archives need no live branch", () => {
  const routes = routeCatalog(
    [
      {
        path: "docs/project/changes/planning/change.json",
        state: { id: "planning", branch: "develop" },
      },
      {
        path: "docs/project/changes/running/change.json",
        state: {
          id: "running",
          branch: "change/running",
          stage: "requirement",
          tasks: "stale fields are not read",
        },
      },
      {
        path: "docs/project/archive/2026-10-18-done/change.json",
        state: archived("done"),
      },
    ],
    "develop",
    "main",
  );
  assert.deepEqual(
    routes.map(({ id, kind, branch }) => ({ id, kind, branch })),
    [
      { id: "done", kind: "archive", branch: "develop" },
      { id: "planning", kind: "planning", branch: "develop" },
      { id: "running", kind: "target", branch: "change/running" },
    ],
  );
});
test("catalog duplicates, malformed ownership and incomplete archives stay explicit errors", () => {
  const routes = routeCatalog(
    [
      {
        path: "docs/project/changes/duplicate/change.json",
        state: { id: "duplicate", branch: "change/duplicate" },
      },
      {
        path: "docs/project/archive/2026-10-18-duplicate/change.json",
        state: archived("duplicate"),
      },
      {
        path: "docs/project/changes/wrong/change.json",
        state: { id: "other", branch: "develop" },
      },
      {
        path: "docs/project/changes/protected/change.json",
        state: { id: "protected", branch: "main" },
      },
      {
        path: "docs/project/changes/broken/change.json",
        state: null,
        error: "Invalid JSON",
      },
      {
        path: "docs/project/archive/2026-10-18-incomplete/change.json",
        state: {
          ...archived("incomplete"),
          waitingFor: { kind: "confirmation" },
        },
      },
    ],
    "develop",
    "main",
  );
  assert.equal(routes.length, 5);
  for (const route of routes) {
    assert.equal(route.kind, "invalid");
    assert.equal(route.branch, null);
    assert(route.errors.length);
  }
});
