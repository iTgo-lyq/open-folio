import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { submoduleFixture } from "./submodule-fixture.ts";
import {
  prepare,
  register,
} from "../.agents/skills/spec-trail/prototype/scripts/publishing.mjs";
import { uploadToOpenFolio } from "../.agents/skills/spec-trail/prototype/scripts/openfolio-client.mjs";
import {
  requestIdentity,
  validateRequest,
  resultArtifact,
} from "../.agents/skills/spec-trail/prototype/scripts/publication-contract.mjs";
import { validateArtifact } from "../.agents/skills/spec-trail/prototype/scripts/contract.mjs";

test("scoped publication identities include package paths and preserve legacy request IDs", () => {
  const request = {
    schemaVersion: 1,
    repository: "https://example.test/team/frontend.git",
    sourceCommit: "a".repeat(40),
    artifactDirectory: "/tmp/dist",
    digest: `sha256:${"b".repeat(64)}`,
    entries: [{ id: "screen", entryPath: "index.html" }],
    requestId: "",
  };
  request.requestId = requestIdentity(request);
  const legacy = createHash("sha256")
    .update(
      JSON.stringify([
        request.repository,
        request.sourceCommit,
        request.digest,
        request.entries,
      ]),
    )
    .digest("hex");
  assert.equal(request.requestId, legacy);
  validateRequest(request);
  for (const packagePath of ["", "packages/prototype"]) {
    const scoped = { ...request, packagePath };
    scoped.requestId = requestIdentity(scoped);
    assert.notEqual(scoped.requestId, legacy);
    validateRequest(scoped);
    const artifact = resultArtifact(
      {
        version: "v1",
        sourceCommit: scoped.sourceCommit,
        digest: scoped.digest,
      },
      { url: "https://static.test/v1/index.html" },
      scoped,
    );
    assert.deepEqual(artifact.source, {
      repository: scoped.repository,
      packagePath,
    });
    assert.deepEqual(validateArtifact(artifact), []);
    for (const source of [
      { ...artifact.source, packagePath: "../escape" },
      {
        ...artifact.source,
        repository: "https://user:secret@example.test/repo",
      },
      { ...artifact.source, submodulePath: "../escape" },
    ])
      assert.ok(validateArtifact({ ...artifact, source }).length);
    const insecure = {
      ...scoped,
      repository: "http://example.test/team/frontend.git",
    };
    insecure.requestId = requestIdentity(insecure);
    assert.throws(() => validateRequest(insecure), /HTTPS/);
  }
});

test("frontend upload needs no workflow and saves scoped receipts for a local registration retry", async (t) => {
  const f = await submoduleFixture();
  t.after(f.cleanup);
  await f.childPut(".gitignore", "dist/\n");
  const source = f.childCommit();
  const parent = f.git(["rev-parse", "HEAD"]),
    path = join(f.child, f.path("prototype.json"));
  await f.childPut(
    f.path("dist/index.html"),
    "<!doctype html><body>frontend uploaded</body>",
  );
  const request = prepare(
    f.child,
    f.path("dist"),
    [{ id: "screen", entryPath: "index.html" }],
    "https://example.test/team/frontend.git",
    "packages/prototype",
  );
  const requestPath = join(f.root, "request.json"),
    resultPath = join(f.root, "result.json"),
    before = await readFile(path, "utf8");
  await writeFile(requestPath, JSON.stringify(request));
  let dirty = true,
    calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    for await (const _chunk of req) {
    }
    if (dirty)
      await f.childPut(
        f.path("dist/index.html"),
        "changed output during upload",
      );
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        schemaVersion: 1,
        status: "published",
        requestId: request.requestId,
        sourceCommit: request.sourceCommit,
        digest: request.digest,
        version: request.requestId,
        entries: [
          {
            id: "screen",
            path: `prototype-assets/${request.requestId}/index.html`,
          },
        ],
      }),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const upload = () =>
    uploadToOpenFolio(f.child, {
      requestPath,
      resultPath,
      change: undefined,
      openfolioUrl: base,
      uploadUrl: base + "/upload",
    });
  await assert.rejects(upload(), /Build output changed/);
  assert.equal(await readFile(path, "utf8"), before);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  await f.childPut(
    f.path("dist/index.html"),
    "<!doctype html><body>frontend uploaded</body>",
  );
  register(f.child, { request, result });
  const artifact = JSON.parse(await readFile(path, "utf8")).entries[0].artifact;
  assert.equal(artifact.sourceCommit, source);
  assert.deepEqual(artifact.source, {
    repository: request.repository,
    packagePath: "packages/prototype",
  });
  assert.equal(f.git(["rev-parse", "HEAD"]), parent);
  assert.equal(f.git(["diff", "--name-only", "--", "docs/project"]), "");
  // Complete metadata commit and retry the same immutable upload: the source
  // baseline remains A even though the frontend now has catalog commit B.
  f.childCommit();
  dirty = false;
  // Upload re-prepares at HEAD, so receipts are retried via register after B.
  register(f.child, { request, result });
  assert.equal(calls, 1);
});
