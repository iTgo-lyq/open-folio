import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  writeFile,
  readFile,
  access,
  appendFile,
} from "node:fs/promises";
import { join } from "node:path";
import { GitReader } from "../src/server/git.ts";
import { SecretHandle } from "../src/server/providers/types.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";

test("HTTPS Git isolates host credentials, authenticates refs/fetch, and rejects stale local config", async () => {
  const f = await gitHttpsFixture();
  const previous = { ...process.env };
  try {
    const host = join(f.root, "host"),
      marker = join(f.root, "helper-ran");
    await mkdir(host);
    await writeFile(
      join(host, ".gitconfig"),
      `[credential]\nhelper = !echo invoked > ${marker}; echo username=reader; echo password=token-b\n[http]\nextraHeader = Authorization: Basic ${Buffer.from("reader:token-b").toString("base64")}\n`,
    );
    await writeFile(
      join(host, ".netrc"),
      "machine 127.0.0.1 login reader password token-b\n",
      { mode: 0o600 },
    );
    Object.assign(process.env, {
      HOME: host,
      XDG_CONFIG_HOME: host,
      GIT_CONFIG_GLOBAL: join(host, ".gitconfig"),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from("reader:token-b").toString("base64")}`,
      GIT_SSL_CAINFO: f.cert,
      NO_PROXY: "127.0.0.1",
      no_proxy: "127.0.0.1",
      GIT_TRACE: join(f.root, "trace"),
    });
    const reader = (token: string, dir = token) =>
      new GitReader(join(f.root, dir), {
        url: f.url,
        username: "reader",
        secret: new SecretHandle(token),
      });
    const signal = () => AbortSignal.timeout(20_000);
    await assert.rejects(
      () => new GitReader(join(f.root, "no-token"), f.url).remoteRefs(signal()),
      { code: "TOKEN_REQUIRED" },
    );
    await assert.rejects(() => reader("wrong").remoteRefs(signal()), {
      code: "GIT_READ_FAILED",
    });
    assert.ok(f.attempts.includes("reader:wrong"));
    assert.ok(!f.attempts.includes("reader:token-b"));
    const good = reader("token-a");
    assert.match(await good.remoteRefs(signal()), /refs\/heads\/main/);
    const data = await good.collect(DEFAULT_LIMITS, signal());
    assert.equal(data.defaultBranch, "main");
    assert.ok(data.documents.some((d) => d.path.endsWith("spec.md")));
    assert.ok(f.attempts.filter((a) => a === "reader:token-a").length >= 3);
    const config = await readFile(join(good.directory, "config"), "utf8");
    assert.ok(!config.includes("token-a"));
    assert.ok(!config.toLowerCase().includes("authorization"));
    await assert.rejects(() => access(marker));
    await assert.rejects(() => access(join(f.root, "trace")));
    f.attempts.length = 0;
    await Promise.all([
      reader("token-a", "parallel-a").remoteRefs(signal()),
      reader("token-b", "parallel-b").remoteRefs(signal()),
    ]);
    assert.deepEqual(
      new Set(f.attempts),
      new Set(["reader:token-a", "reader:token-b"]),
    );
    f.allowed.delete("reader:token-a");
    await assert.rejects(() => good.remoteRefs(signal()), {
      code: "GIT_READ_FAILED",
    });
    await appendFile(
      join(good.directory, "config"),
      "[include]\npath = /etc/gitconfig\n",
    );
    await assert.rejects(() => good.remoteRefs(signal()), {
      code: "GIT_CONFIG_UNTRUSTED",
    });
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      () => reader("token-b", "cancelled").remoteRefs(cancelled.signal),
      { code: "GIT_READ_FAILED" },
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await f.cleanup();
  }
});
