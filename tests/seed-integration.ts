import { rename } from "node:fs/promises";
import { join } from "node:path";
import { completedChange } from "./integration-fixture.ts";
import type { fixture } from "./fixture.ts";

export async function seedIntegration(f: Awaited<ReturnType<typeof fixture>>) {
  const id = "integration-demo",
    branch = `change/${id}`;
  await f.register({ [id]: branch });
  await f.put(`docs/project/changes/${id}/requirement.md`, "# 合入阅读示例\n");
  f.commit();
  f.git(["checkout", "-b", branch]);
  const record = { ...completedChange(id), title: "合入阅读示例" };
  await f.put(
    `${record.closure.archive.path}/change.json`,
    JSON.stringify(record),
  );
  await rename(
    join(f.author, `docs/project/changes/${id}/requirement.md`),
    join(f.author, `${record.closure.archive.path}/requirement.md`),
  );
  f.git(["rm", `docs/project/changes/${id}/change.json`]);
  await f.put(
    "src/integration-example.ts",
    "export const delivered = true;\nexport const version = 1;\n",
  );
  await f.put("assets/integration-example.bin", Buffer.from([0, 1, 2, 3]));
  await f.put("assets/integration-large.html", "x".repeat(1024 * 1024 + 1));
  f.commit();
  f.git(["checkout", "develop"]);
  f.git([
    "merge",
    "--no-ff",
    branch,
    "-m",
    `Merge Change ${id} into develop\n\nSpecTrail-Change: ${id}`,
  ]);
  f.recordMerge(id, branch);
  f.git(["push", "origin", "develop"]);
  f.git(["push", "origin", "--delete", branch]);
  f.git(["branch", "-d", branch]);
}
