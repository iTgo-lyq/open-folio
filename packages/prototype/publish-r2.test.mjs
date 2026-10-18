import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  copyFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { artifactDigest } from "../../.agents/skills/spec-trail/prototype/scripts/publishing.mjs";
import {
  requestIdentity,
  validateResult,
} from "../../.agents/skills/spec-trail/prototype/scripts/publication-contract.mjs";
import { publishToR2 } from "./publish-r2.mjs";

const env = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_BUCKET: "test-prototypes",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "open-folio-r2-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "shell"));
  await writeFile(
    join(dir, "shell/index.html"),
    "<!doctype html><title>Shell</title><p>Shell</p>",
  );
  const request = {
    schemaVersion: 1,
    repository: "https://github.com/iTgo-lyq/open-folio",
    sourceCommit: "b".repeat(40),
    artifactDirectory: dir,
    digest: artifactDigest(dir).digest,
    entries: [{ id: "shell", entryPath: "shell/index.html", hash: "#preview" }],
  };
  request.requestId = requestIdentity(request);
  return { dir, request };
}
async function cliFixture(t) {
  const { dir, request } = await fixture(t);
  const root = join(dir, "repository"),
    packageDirectory = join(root, "packages/prototype"),
    script = join(packageDirectory, "publish-r2.mjs"),
    input = join(dir, "request.json"),
    output = join(dir, "result.json");
  await mkdir(packageDirectory, { recursive: true });
  await copyFile(
    fileURLToPath(new URL("./publish-r2.mjs", import.meta.url)),
    script,
  );
  for (const name of ["node_modules", ".agents"]) {
    await symlink(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      join(root, name),
    );
  }
  await writeFile(input, JSON.stringify(request));
  return {
    root,
    packageDirectory,
    dir,
    request,
    output,
    run: (options = {}) =>
      spawnSync(
        process.execPath,
        [script, "--request", input, "--result", output],
        {
          env: {},
          encoding: "utf8",
          timeout: 10000,
          ...options,
        },
      ),
  };
}
const envText = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
function storage() {
  const objects = new Map(),
    calls = [];
  return {
    objects,
    calls,
    client: {
      async send(command) {
        const value = command.input;
        calls.push(command);
        if (command.constructor.name === "PutObjectCommand") {
          assert.equal(value.IfNoneMatch, "*");
          assert.equal(value.StorageClass, "STANDARD");
          if (objects.has(value.Key))
            throw { $metadata: { httpStatusCode: 412 } };
          objects.set(value.Key, {
            bytes: Buffer.from(value.Body),
            contentType: value.ContentType,
          });
          return {};
        }
        const object = objects.get(value.Key);
        return {
          ContentType: object.contentType,
          Body: {
            async transformToByteArray() {
              return object.bytes;
            },
          },
        };
      },
    },
    async fetchImpl(url, options) {
      assert.equal(options.redirect, "error");
      assert.equal(options.headers, undefined);
      const object = objects.get(
        decodeURIComponent(new URL(url).pathname.slice(1)),
      );
      return new Response(object?.bytes, {
        status: object ? 200 : 404,
        headers: { "content-type": object?.contentType ?? "text/plain" },
      });
    },
  };
}

test("publishes verified immutable URLs; retry returns the identical result", async (t) => {
  const { request } = await fixture(t),
    host = storage();
  const first = await publishToR2(request, { env, ...host });
  validateResult(request, first);
  assert.equal(
    first.entries[0].url,
    `${env.R2_PUBLIC_BASE_URL}/open-folio/${request.requestId}/shell/index.html#preview`,
  );
  assert.deepEqual(await publishToR2(request, { env, ...host }), first);
  assert.equal(host.objects.size, 1);
  assert.equal(
    host.calls.filter((c) => c.constructor.name === "GetObjectCommand").length,
    1,
  );
});

test("does not overwrite a conflicting existing version", async (t) => {
  const { request } = await fixture(t),
    host = storage();
  const key = `open-folio/${request.requestId}/shell/index.html`;
  host.objects.set(key, {
    bytes: Buffer.from("old content"),
    contentType: "text/html; charset=utf-8",
  });
  await assert.rejects(publishToR2(request, { env, ...host }), {
    publishCode: "VERSION_CONFLICT",
  });
  assert.equal(host.objects.get(key).bytes.toString(), "old content");
});

test("rejects changed output before making a network request", async (t) => {
  const { dir, request } = await fixture(t),
    host = storage();
  await writeFile(join(dir, "shell/index.html"), "changed");
  await assert.rejects(publishToR2(request, { env, ...host }), {
    publishCode: "ARTIFACT",
  });
  assert.equal(host.calls.length, 0);
});

test("rejects a missing entry before uploading", async (t) => {
  const { request } = await fixture(t),
    host = storage();
  request.entries[0].entryPath = "missing.html";
  request.requestId = requestIdentity(request);
  await assert.rejects(publishToR2(request, { env, ...host }), {
    publishCode: "ARTIFACT",
  });
  assert.equal(host.calls.length, 0);
});

test("partial upload failure can be retried without replacing earlier objects", async (t) => {
  const { dir, request } = await fixture(t),
    host = storage();
  await writeFile(join(dir, "shell/style.css"), "body { color: navy }");
  request.digest = artifactDigest(dir).digest;
  request.requestId = requestIdentity(request);
  const client = {
    send: (command) =>
      command.input.Key.endsWith("style.css")
        ? Promise.reject({ $metadata: { httpStatusCode: 503 } })
        : host.client.send(command),
  };
  await assert.rejects(publishToR2(request, { env, ...host, client }), {
    publishCode: "R2_REQUEST",
    retryable: true,
  });
  assert.equal(host.objects.size, 1);
  validateResult(request, await publishToR2(request, { env, ...host }));
  assert.equal(host.objects.size, 2);
});

test("permission errors are sanitized and never expose credentials", async (t) => {
  const { request } = await fixture(t);
  const client = {
    async send() {
      throw Object.assign(new Error(env.R2_SECRET_ACCESS_KEY), {
        $metadata: { httpStatusCode: 403 },
      });
    },
  };
  await assert.rejects(publishToR2(request, { env, client }), (error) => {
    assert.equal(error.message, "R2 request failed (HTTP 403)");
    assert.equal(error.retryable, false);
    return true;
  });
});

test("rejects public errors, wrong bytes and download MIME types", async (t) => {
  const { request } = await fixture(t);
  for (const response of [
    () => new Response("Forbidden", { status: 403 }),
    () => new Response("wrong", { headers: { "content-type": "text/html" } }),
    () =>
      new Response("download", {
        headers: { "content-type": "application/octet-stream" },
      }),
  ]) {
    await assert.rejects(
      publishToR2(request, {
        env,
        ...storage(),
        fetchImpl: async () => response(),
      }),
      { publishCode: "PUBLIC_READ" },
    );
  }
});

test("registers only screenshots included in the verified artifact", async (t) => {
  const { dir, request } = await fixture(t),
    host = storage();
  await writeFile(
    join(dir, "shell/pc-web.png"),
    Buffer.from([137, 80, 78, 71]),
  );
  request.digest = artifactDigest(dir).digest;
  request.requestId = requestIdentity(request);
  const result = await publishToR2(request, { env, ...host });
  assert.deepEqual(result.entries[0].thumbnails, [
    {
      device: "pc-web",
      url: `${env.R2_PUBLIC_BASE_URL}/open-folio/${request.requestId}/shell/pc-web.png`,
    },
  ]);
});

for (const directory of ["", "pages/renamed-layout"]) {
  test(`discovers screenshots beside ${directory || "root"} entry independently of id`, async (t) => {
    const { dir, request } = await fixture(t),
      host = storage();
    const prefix = directory ? `${directory}/` : "";
    await mkdir(join(dir, directory), { recursive: true });
    await writeFile(
      join(dir, prefix + "index.html"),
      "<!doctype html><title>Page</title>",
    );
    const devices = ["pc-web", "ipad", "mobile"];
    for (const device of devices) {
      await writeFile(
        join(dir, `${prefix}${device}.png`),
        Buffer.from([137, 80, 78, 71]),
      );
    }
    // A different entry has only a desktop image; neither entry may borrow the other's images.
    await writeFile(
      join(dir, "shell/pc-web.png"),
      Buffer.from([137, 80, 78, 71, 1]),
    );
    request.entries.push({
      id: "another-id",
      entryPath: prefix + "index.html",
    });
    request.digest = artifactDigest(dir).digest;
    request.requestId = requestIdentity(request);
    const result = await publishToR2(request, { env, ...host });
    validateResult(request, result);
    const base = `${env.R2_PUBLIC_BASE_URL}/open-folio/${request.requestId}/`;
    assert.deepEqual(
      result.entries.find((e) => e.id === "another-id").thumbnails,
      devices.map((device) => ({
        device,
        url: `${base}${prefix}${device}.png`,
      })),
    );
    assert.deepEqual(result.entries.find((e) => e.id === "shell").thumbnails, [
      { device: "pc-web", url: `${base}shell/pc-web.png` },
    ]);
    assert.deepEqual(await publishToR2(request, { env, ...host }), result);
  });
}

test("does not register a screenshot from an id directory unrelated to the entry", async (t) => {
  const { dir, request } = await fixture(t),
    host = storage();
  await writeFile(
    join(dir, "index.html"),
    "<!doctype html><title>Root</title>",
  );
  await writeFile(
    join(dir, "shell/pc-web.png"),
    Buffer.from([137, 80, 78, 71]),
  );
  request.entries = [{ id: "shell", entryPath: "index.html" }];
  request.digest = artifactDigest(dir).digest;
  request.requestId = requestIdentity(request);
  const result = await publishToR2(request, { env, ...host });
  assert.equal(result.entries[0].thumbnails, undefined);
});

test("rejects missing credentials and non-public or credential-bearing URLs", async (t) => {
  const { request } = await fixture(t),
    host = storage();
  await assert.rejects(publishToR2(request, { env: {}, ...host }), {
    publishCode: "CONFIGURATION",
  });
  for (const url of [
    "http://pub-test.r2.dev",
    "https://user:secret@pub-test.r2.dev",
    "https://pub-test.r2.dev?token=secret",
  ]) {
    await assert.rejects(
      publishToR2(request, {
        env: { ...env, R2_PUBLIC_BASE_URL: url },
        ...host,
      }),
      { publishCode: "CONFIGURATION" },
    );
  }
  assert.equal(host.calls.length, 0);
});

test("CLI loads repository .env from the root, package and outside directories", async (t) => {
  const { root, packageDirectory, dir, output, run } = await cliFixture(t);
  await writeFile(
    join(root, ".env"),
    envText({ ...env, R2_PUBLIC_BASE_URL: "http://pub-test.r2.dev" }),
  );
  for (const cwd of [root, packageDirectory, dir]) {
    const result = run({ cwd });
    assert.equal(result.status, 1);
    const failure = JSON.parse(await readFile(output, "utf8"));
    assert.equal(failure.code, "CONFIGURATION");
    assert.match(failure.message, /R2_PUBLIC_BASE_URL must be.*HTTPS/);
    assert.ok(!result.stdout.includes(env.R2_SECRET_ACCESS_KEY));
    assert.ok(!result.stderr.includes(env.R2_SECRET_ACCESS_KEY));
  }
});

test("CLI gives process variables priority over .env.local and .env", async (t) => {
  const { root, output, run } = await cliFixture(t);
  await writeFile(join(root, ".env"), envText(env));
  await writeFile(
    join(root, ".env.local"),
    envText({ R2_ACCOUNT_ID: "invalid-local-account" }),
  );
  assert.equal(run().status, 1);
  assert.equal(
    JSON.parse(await readFile(output, "utf8")).message,
    "Invalid R2 account ID or bucket name",
  );
  assert.equal(run({ env: { R2_ACCOUNT_ID: "" } }).status, 1);
  assert.equal(
    JSON.parse(await readFile(output, "utf8")).message,
    "Missing R2_ACCOUNT_ID",
  );
});

test("CLI replaces stale success with a failed result when configuration is missing", async (t) => {
  const { request, output, run } = await cliFixture(t);
  await writeFile(output, JSON.stringify({ status: "published" }));
  assert.equal(run().status, 1);
  const result = JSON.parse(await readFile(output, "utf8"));
  assert.equal(result.status, "failed");
  assert.equal(result.code, "CONFIGURATION");
  assert.equal(result.message, "Missing R2_ACCOUNT_ID");
  assert.throws(
    () => validateResult(request, result),
    /Host publication failed/,
  );
});
