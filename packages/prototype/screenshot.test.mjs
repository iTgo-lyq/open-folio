import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
const script = fileURLToPath(new URL("./screenshot.mjs", import.meta.url));

test("captures standard devices and a custom viewport from a sandboxed HTML entry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "openfolio-screenshot-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = join(root, "index.html");
  await writeFile(
    entry,
    '<!doctype html><html><body style="margin:0;background:#405070"><script>if(window.parent===window)throw Error("iframe required");try{localStorage.setItem("test","value");throw Error("storage must be blocked")}catch(error){if(error.name!=="SecurityError")throw error}</script>Sandbox preview</body></html>',
  );
  const call = (...args) =>
    execute(process.execPath, [script, "--entry", entry, ...args], {
      timeout: 20000,
    });
  await call();
  for (const [name, width, height] of [
    ["pc-web", 1440, 900],
    ["ipad", 834, 1194],
    ["mobile", 390, 844],
  ]) {
    const png = await readFile(join(root, `${name}.png`));
    assert.deepEqual(
      [png.readUInt32BE(16), png.readUInt32BE(20)],
      [width, height],
    );
  }
  await call("--viewport", "320x720");
  const custom = await readFile(join(root, "custom.png"));
  assert.deepEqual(
    [custom.readUInt32BE(16), custom.readUInt32BE(20)],
    [320, 720],
  );
  await assert.rejects(call("--viewport", "4097x900"), /Viewport must/);
  await assert.rejects(call("--device", "watch"), /Unknown device/);
  await assert.rejects(
    call("--device", "mobile", "--viewport", "320x720"),
    /Usage:/,
  );
  await writeFile(
    entry,
    '<!doctype html><html><body><img src="https://example.com/remote.png"></body></html>',
  );
  await assert.rejects(call(), /必须内联/);
  await writeFile(
    entry,
    '<!doctype html><html><body><script>throw Error("broken prototype")</script></body></html>',
  );
  await assert.rejects(
    call("--device", "mobile"),
    /Prototype render failed: broken prototype/,
  );
});
