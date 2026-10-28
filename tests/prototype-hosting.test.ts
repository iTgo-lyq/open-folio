import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adminPassword, login } from "../src/server/access.ts";
import {
  hostedAsset,
  hostingInfo,
  uploadPublication,
} from "../src/server/prototype-hosting.ts";
import {
  encodeUploadHeader,
  digestPrefix,
  uploadMagic,
  uploadType,
} from "../.agents/skills/spec-trail/prototype/scripts/upload-protocol.mjs";
import { requestIdentity } from "../.agents/skills/spec-trail/prototype/scripts/publication-contract.mjs";

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "folio-hosting-"));
  const before = {
    OPENFOLIO_DATA_DIR: process.env.OPENFOLIO_DATA_DIR,
    OPENFOLIO_ADMIN_PASSWORD: process.env.OPENFOLIO_ADMIN_PASSWORD,
  };
  process.env.OPENFOLIO_DATA_DIR = root;
  process.env.OPENFOLIO_ADMIN_PASSWORD = "test-admin";
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  const cookie = (
    await login(
      new Request("http://folio.test/api/access"),
      await adminPassword(),
    )
  ).split(";")[0];
  const info = () =>
    hostingInfo(
      new Request("http://folio.test/api/prototype-hosting", {
        headers: { cookie },
      }),
    );
  const response = await info();
  const { uploadPath } = await response.json();
  return {
    root,
    info,
    cookie,
    key: uploadPath.split("/").at(-1) as string,
    uploadPath,
  };
}
function payload(
  content: Record<string, string> = {
    "assets/app.js": "document.body.dataset.ready='yes'",
    "index.html":
      '<!doctype html><script type="module" src="./assets/app.js"></script>',
  },
) {
  const files = Object.entries(content).map(([path, body]) => ({
    path,
    size: Buffer.byteLength(body),
  }));
  const hash = createHash("sha256");
  for (const file of files)
    hash.update(digestPrefix(file.path, file.size)).update(content[file.path]);
  const request = {
    schemaVersion: 1,
    repository: "https://example.test/unregistered.git",
    sourceCommit: "a".repeat(40),
    artifactDirectory: "/client-only/dist",
    digest: `sha256:${hash.digest("hex")}`,
    entries: [{ id: "page", entryPath: "index.html" }],
    requestId: "",
  };
  request.requestId = requestIdentity(request);
  const body = Buffer.concat([
    encodeUploadHeader(request, files),
    ...files.map((f) => Buffer.from(content[f.path])),
  ]);
  return { files, request, body, content };
}
const send = (key: string, body: Buffer, signal?: AbortSignal) =>
  uploadPublication(
    new Request(`http://folio.test/api/prototype-uploads/${key}`, {
      method: "POST",
      headers: { "content-type": uploadType },
      body: new Uint8Array(body),
      signal,
    }),
    key,
  );
const asset = (
  version: string,
  path = "index.html",
  method = "GET",
  headers = {},
) =>
  hostedAsset(
    new Request(`http://folio.test/prototype-assets/${version}/${path}`, {
      method,
      headers,
    }),
    version,
    path,
  );

test("only admins discover the stable private upload address; holders publish publicly without project configuration", async (t) => {
  const f = await setup(t),
    p = payload();
  assert.equal(
    (await hostingInfo(new Request("http://folio.test/api/prototype-hosting")))
      .status,
    401,
  );
  assert.deepEqual(await (await f.info()).json(), { uploadPath: f.uploadPath });
  assert.equal(
    (await stat(join(f.root, "prototype-upload-key"))).mode & 0o777,
    0o600,
  );
  assert.equal((await send("wrong", p.body)).status, 401);
  const results = await Promise.all([send(f.key, p.body), send(f.key, p.body)]);
  for (const response of results)
    assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await results[0].json(), await results[1].json());
  const first = await asset(p.request.requestId);
  assert.equal(first.status, 200);
  assert.equal(await first.text(), p.content["index.html"]);
  assert.equal(first.headers.get("access-control-allow-origin"), "*");
  assert.match(
    first.headers.get("content-security-policy")!,
    /sandbox allow-scripts/,
  );
  assert.match(first.headers.get("cache-control")!, /public.*immutable/);
  assert.equal(
    (await asset(p.request.requestId, "index.html", "HEAD")).headers.get(
      "content-length",
    ),
    String(p.files[1].size),
  );
  assert.equal(
    await (await asset(p.request.requestId, "index.html", "HEAD")).text(),
    "",
  );
  assert.equal(
    (
      await asset(p.request.requestId, "index.html", "GET", {
        "if-none-match": first.headers.get("etag")!,
      })
    ).status,
    304,
  );
  assert.equal(
    await (await asset(p.request.requestId, "assets/app.js")).text(),
    p.content["assets/app.js"],
  );
  assert.equal(
    (await asset(p.request.requestId, "publication.json")).status,
    404,
  );
  assert.deepEqual(await readdir(join(f.root, "prototype-artifacts")), [
    p.request.requestId,
  ]);
  assert.equal(
    (
      await stat(
        join(
          f.root,
          "prototype-artifacts",
          p.request.requestId,
          "files/index.html",
        ),
      )
    ).mode & 0o777,
    0o600,
  );
  await assert.rejects(readFile(join(f.root, "config.json")), {
    code: "ENOENT",
  });
  // Changing the uploader's working directory does not change the immutable publication identity.
  const request = { ...p.request, artifactDirectory: "/another/client/dist" };
  const other = Buffer.concat([
    encodeUploadHeader(request, p.files),
    ...p.files.map((f) => Buffer.from(p.content[f.path])),
  ]);
  assert.equal((await send(f.key, other)).status, 200);
  const restarted = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--input-type=module",
      "-e",
      `import { hostedAsset } from './src/server/prototype-hosting.ts'; const response = await hostedAsset(new Request('http://folio.test/'), '${p.request.requestId}', 'index.html'); console.log(JSON.stringify({status:response.status, body:await response.text()}));`,
    ],
    { encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(restarted), {
    status: 200,
    body: p.content["index.html"],
  });
});

test("incomplete, corrupt and unsafe uploads never publish a version or replace old bytes", async (t) => {
  const f = await setup(t),
    p = payload();
  const raw = (header: unknown) => {
    const bytes = Buffer.from(JSON.stringify(header)),
      size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    return Buffer.concat([uploadMagic, size, bytes]);
  };
  const corrupt = Buffer.from(p.body);
  corrupt[corrupt.length - 1] ^= 1;
  const malformed = [
    p.body.subarray(0, p.body.length - 1),
    Buffer.concat([p.body, Buffer.from("extra")]),
    corrupt,
    raw({ request: p.request, files: [{ path: "../escape", size: 1 }] }),
    raw({
      request: p.request,
      files: [{ path: "index.html", size: 101 * 1024 * 1024 }],
    }),
    raw({
      request: p.request,
      files: [
        { path: "index.html", size: 1 },
        { path: "index.html", size: 1 },
      ],
    }),
    raw({
      request: p.request,
      files: [
        { path: "index.html", size: 1 },
        { path: "index.html/child", size: 1 },
      ],
    }),
  ];
  for (const body of malformed)
    assert.equal((await send(f.key, body)).status, 400);
  assert.deepEqual(await readdir(join(f.root, "prototype-artifacts")), []);
  assert.equal((await send(f.key, p.body)).status, 200);
  for (const path of [
    "../publication.json",
    "%2e%2e/publication.json",
    "assets/../../../admin-password",
  ])
    assert.equal((await asset(p.request.requestId, path)).status, 404);
  const file = join(
    f.root,
    "prototype-artifacts",
    p.request.requestId,
    "files/index.html",
  );
  await writeFile(file, "x".repeat(p.files[1].size));
  assert.equal((await send(f.key, p.body)).status, 409);
  assert.equal((await asset(p.request.requestId)).status, 404);
  assert.equal(await readFile(file, "utf8"), "x".repeat(p.files[1].size));
  await rm(file);
  await symlink(join(f.root, "prototype-upload-key"), file);
  assert.equal((await asset(p.request.requestId)).status, 404);
});

test("streamed chunks, cancellation, revocation and disk failures release upload slots and staging files", async (t) => {
  const f = await setup(t),
    p = payload();
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (at >= p.body.length) c.close();
      else {
        c.enqueue(p.body.subarray(at, at + 7));
        at += 7;
      }
    },
  });
  const request = new Request("http://folio.test/upload", {
    method: "POST",
    headers: { "content-type": uploadType },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal((await uploadPublication(request, f.key)).status, 200);
  const controllers = [new AbortController(), new AbortController()];
  let started = 0;
  const stalled = controllers.map((controller) => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        started++;
        return new Promise(() => {});
      },
    });
    return uploadPublication(
      new Request("http://folio.test/upload", {
        method: "POST",
        headers: { "content-type": uploadType },
        body,
        duplex: "half",
        signal: controller.signal,
      } as RequestInit),
      f.key,
    );
  });
  while (started < 2) await new Promise((r) => setTimeout(r, 5));
  assert.equal((await send(f.key, p.body)).status, 429);
  controllers.forEach((c) => c.abort());
  for (const response of await Promise.all(stalled))
    assert.equal(response.status, 408);
  assert.equal((await send(f.key, p.body)).status, 200);
  await writeFile(join(f.root, "prototype-upload-key"), "rotated-key");
  assert.equal((await send(f.key, p.body)).status, 401);
  assert.equal((await asset(p.request.requestId)).status, 200);
  await rm(join(f.root, "prototype-artifacts"), { recursive: true });
  await writeFile(join(f.root, "prototype-artifacts"), "not a directory");
  assert.equal((await send("rotated-key", p.body)).status, 503);
});

test("frontend package scope is accepted by hosting and separates otherwise identical publications", async (t) => {
  const f = await setup(t),
    p = payload();
  const versions = new Set<string>();
  for (const packagePath of ["", "packages/prototype"]) {
    const request = { ...p.request, packagePath };
    request.requestId = requestIdentity(request);
    const bytes = Buffer.concat([
      encodeUploadHeader(request, p.files),
      ...p.files.map((file) => Buffer.from(p.content[file.path])),
    ]);
    const response = await send(f.key, bytes);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    versions.add(result.version);
    assert.equal(result.sourceCommit, request.sourceCommit);
    assert.equal(
      await (await asset(result.version)).text(),
      p.content["index.html"],
    );
  }
  assert.equal(versions.size, 2);
  assert.ok(!versions.has(p.request.requestId));
});
