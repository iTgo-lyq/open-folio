import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

/**
 * Run `operation` while holding the repository-wide state lock in the Git
 * common directory, shared by every worktree. The owner file helps a person
 * confirm that a leftover lock is stale. Works for sync and async operations.
 */
export function withStateLock(common, root, operation, { hint = "" } = {}) {
  const lock = join(common, "spec-trail-state.lock");
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        `Another state operation holds ${lock}. Inspect owner.json (if present) and the owning process; only remove a confirmed stale lock.${hint && ` ${hint}`}`,
      );
    throw error;
  }
  const release = () => rmSync(lock, { recursive: true, force: true });
  let result;
  try {
    writeFileSync(join(lock, "owner.json"), JSON.stringify({
      pid: process.pid, hostname: hostname(), root, startedAt: new Date().toISOString(),
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    result = operation();
  } catch (error) {
    release();
    throw error;
  }
  if (typeof result?.then === "function") return result.finally(release);
  release();
  return result;
}
