import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import {
  mkdtemp,
  mkdir,
  copyFile,
  symlink,
  writeFile,
  readFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
const execute = promisify(execFile);

test(
  "service lifecycle preserves data, serializes updates and leaves occupied ports alone",
  { timeout: 60000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "openfolio-service-test-"));
    const session = `folio-test-${process.pid}-${randomBytes(4).toString("hex")}`;
    const reserve = createServer();
    await new Promise<void>((resolve) =>
      reserve.listen(0, "127.0.0.1", resolve),
    );
    const port = (reserve.address() as { port: number }).port;
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    await mkdir(join(root, "scripts"), { recursive: true });
    await mkdir(join(root, "node_modules/next/dist/bin"), { recursive: true });
    await mkdir(join(root, "node_modules/@next"), { recursive: true });
    await mkdir(join(root, "data"));
    await copyFile(
      resolve("scripts/service.mjs"),
      join(root, "scripts/service.mjs"),
    );
    await symlink(
      dirname(createRequire(import.meta.url).resolve("@next/env/package.json")),
      join(root, "node_modules/@next/env"),
    );
    await writeFile(
      join(root, ".env.local"),
      `OPENFOLIO_SERVICE_PORT=${port}\nOPENFOLIO_SERVICE_HOST=127.0.0.1\nOPENFOLIO_SERVICE_SESSION=${session}\nOPENFOLIO_DATA_DIR=${join(root, "data")}\nOPENFOLIO_VERIFY_TOKEN=fixture-private-token\n`,
    );
    await writeFile(join(root, "data/sentinel"), "keep-workspace");
    await writeFile(
      join(root, "node_modules/next/dist/bin/next"),
      `
    const fs = require('node:fs');
    if (process.argv[2] === 'build') {
      if (fs.existsSync('fail-build')) process.exit(1);
      fs.mkdirSync('.next', {recursive:true});
      fs.writeFileSync('.next/BUILD_ID', 'fixture-build');
    } else {
      const server = require('node:http').createServer((request,response) => response.end('ready'));
      server.listen(Number(process.argv.at(-1)), process.argv.at(-3));
      process.on('SIGTERM', () => server.close(() => process.exit(0)));
    }
  `,
    );
    const call = async (command: string) => {
      const result = await execute(
        process.execPath,
        [join(root, "scripts/service.mjs"), command],
        { cwd: tmpdir(), timeout: 40000 },
      );
      assert.ok(!result.stdout.includes("fixture-private-token"));
      return JSON.parse(result.stdout);
    };
    t.after(async () => {
      await call("stop").catch(() => {});
      await execute("tmux", ["kill-session", "-t", session]).catch(() => {});
      reserve.close();
      await rm(root, { recursive: true, force: true });
    });
    assert.equal((await call("status")).state, "stopped");
    const running = await call("update");
    assert.equal(running.state, "running");
    assert.equal(running.port, port);
    assert.equal(running.buildId, "fixture-build");
    assert.equal((await call("start")).pid, running.pid);
    const settings = await readFile(join(root, ".env.local"), "utf8");
    await writeFile(
      join(root, ".env.local"),
      settings.replace(session, `${session}-changed`),
    );
    await assert.rejects(call("update"), /Stop the existing service/);
    await writeFile(join(root, ".env.local"), settings);
    assert.equal((await call("status")).pid, running.pid);
    assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200);
    await writeFile(join(root, ".openfolio/service.lock"), String(process.pid));
    await assert.rejects(call("update"), /Another service operation/);
    assert.equal((await call("status")).pid, running.pid);
    await rm(join(root, ".openfolio/service.lock"));
    await writeFile(join(root, ".openfolio/service.lock"), "2147483647");
    assert.equal((await call("stop")).state, "stopped");
    await new Promise<void>((resolve) =>
      reserve.listen(port, "127.0.0.1", resolve),
    );
    await assert.rejects(call("start"), /occupied/);
    assert.ok(reserve.listening);
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    await writeFile(join(root, "fail-build"), "fail");
    await assert.rejects(call("update"), /Build failed/);
    assert.equal((await call("status")).state, "stopped");
    assert.equal(
      await readFile(join(root, "data/sentinel"), "utf8"),
      "keep-workspace",
    );
    assert.ok(
      !(await readdir(root)).some((name) => /backup|rollback/.test(name)),
    );
    await rm(join(root, "fail-build"));
    assert.equal((await call("update")).state, "running");
    assert.equal(
      await readFile(join(root, "data/sentinel"), "utf8"),
      "keep-workspace",
    );
  },
);
