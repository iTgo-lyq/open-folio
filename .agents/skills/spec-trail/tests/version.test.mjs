import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compareVersions,
  nextVersion,
  parseVersion,
  readVersion,
} from "../scripts/version.mjs";

test("release versions compare numerically and advance only the patch component", () => {
  assert.equal(nextVersion(null), "0.1.0");
  assert.equal(nextVersion("0.1.9"), "0.1.10");
  assert.equal(nextVersion("2.3.4"), "2.3.5");
  assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "0.99.999"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  for (const invalid of [
    "v1.2.3",
    "01.2.3",
    "1.2",
    "1.2.3-beta",
    "1.2.3+build",
    "1.2.-1",
    " 1.2.3",
    "1.2.3\n",
    "9007199254740992.0.0",
    null,
    1,
  ])
    assert.throws(() => parseVersion(invalid));
  assert.throws(() => nextVersion(`0.1.${Number.MAX_SAFE_INTEGER}`));
});

test("missing metadata permits a first release; damaged metadata never resets the version", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "spec-trail-version-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "version.json");
  assert.equal(readVersion(file), null);
  writeFileSync(file, '{"version":"0.1.9"}');
  assert.equal(readVersion(file), "0.1.9");
  for (const value of ["{", "null", "{}", '{"version":"invalid"}']) {
    writeFileSync(file, value);
    assert.throws(() => readVersion(file));
  }
});
