import { rename } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";

export function completedChange(id: string, branch = `change/${id}`) {
  const path = `docs/project/archive/2026-10-18-${id}`;
  const step = (result: string) => ({
    result,
    at: "2026-10-18T00:00:00.000Z",
    summary: "verified",
  });
  return {
    schemaVersion: 1,
    id,
    title: id,
    branch,
    size: "small",
    status: "completed",
    stage: "close",
    confirmations: {},
    tasks: { T1: { title: "Deliver", status: "done" } },
    closure: {
      verification: step("passed"),
      acceptance: step("accepted"),
      specs: step("synced"),
      archive: { ...step("done"), path },
    },
  };
}

export async function integrationFixture(id = "example") {
  const f = await fixture(),
    branch = `change/${id}`;
  await f.register({ [id]: branch });
  const base = f.git(["rev-parse", "HEAD"]);
  f.git(["checkout", "-b", branch]);
  const record = completedChange(id, branch),
    archivePath = record.closure.archive.path;
  // put creates the archive parent before the move.
  await f.put(`${archivePath}/requirement.md`, "# Delivery\n");
  await rename(
    join(f.author, `docs/project/changes/${id}/change.json`),
    join(f.author, `${archivePath}/change.json`),
  );
  await f.put(`${archivePath}/change.json`, JSON.stringify(record));
  await f.put("feature.txt", "delivered\n");
  const source = f.commit();
  const merge = () => {
    f.git(["checkout", "develop"]);
    f.git([
      "merge",
      "--no-ff",
      branch,
      "-m",
      `Merge Change ${id} into develop\n\nSpecTrail-Change: ${id}`,
    ]);
    f.git(["push", "origin", "develop"]);
    return f.git(["rev-parse", "HEAD"]);
  };
  return {
    ...f,
    id,
    branch,
    base,
    source,
    archivePath,
    record,
    merge,
    run: async (args: string[]) => f.git(args),
  };
}
