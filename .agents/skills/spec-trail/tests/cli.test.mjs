import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

test("CLI help and argument errors work outside a Git project", t => {
  const cwd = mkdtempSync(join(tmpdir(), "spec-trail-cli-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const run = args => spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });

  for (const [args, expected] of [
    [["--help"], /Groups:.*change.*workspace/],
    [["change", "--help"], /Commands:.*task-start/],
    [["change", "task-start", "--help"], /--change <value> --task <value>/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
  }

  for (const [args, expected] of [
    [["toString"], /Unknown command group/],
    [["change", "constructor"], /Unknown command/],
    [["change", "show", "--typo"], /Unknown option/],
    [["change", "show", "--change", "example", "extra"], /Unexpected argument/],
    [["change", "task-start", "--change", "example"], /--task is required/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Usage:/);
  }
});
