import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { cp, rm, readdir, writeFile } from "node:fs/promises";
import { repositoryFixture } from "./repositories-fixture.ts";
import { PublicPreviews } from "../src/server/public-previews.ts";
import {
  publicPreviewResponse,
  preparePreviewResponse,
} from "../src/server/public-preview-api.ts";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
async function setup() {
  const t = await repositoryFixture();
  const source = t.g.git(["rev-parse", "HEAD"]);
  const entry = {
    id: "screen",
    title: "共享原型",
    kind: "page",
    devices: ["pc-web", "mobile"],
    sourcePath: "packages/prototype/src/screen.html",
    artifact: {
      type: "git",
      path: "packages/prototype/preview/screen",
      sourceCommit: source,
    },
  };
  await t.g.put(
    "packages/prototype/prototype.json",
    JSON.stringify({ schemaVersion: 1, entries: [entry] }),
  );
  await t.g.put(
    "packages/prototype/preview/screen/index.html",
    "<!doctype html><html><head><meta charset=utf-8></head><body><h1>Public screen</h1></body></html>",
  );
  t.g.commit();
  await t.read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const root = join(t.f.root, "public");
  let renders = 0;
  const store = new PublicPreviews(
    root,
    new ThumbnailCache(join(root, "screenshots"), async () => {
      renders++;
      return Buffer.from([255, 216, 255, 217]);
    }),
  );
  const prepare = () =>
    t.service.read(t.c.cookie, t.c.connection.id, t.key, (ctx) =>
      store.prepare(ctx, { entry: "screen" }, DEFAULT_LIMITS),
    );
  return { ...t, root, store, entry, prepare, renders: () => renders };
}
test("fixed Git publications survive publisher removal, disconnected providers and disabled workflow; anonymous reads never call Git", async () => {
  const t = await setup();
  try {
    const meta = await t.prepare();
    assert.equal(t.renders(), 2);
    assert.deepEqual(await t.prepare(), JSON.parse(JSON.stringify(meta)));
    assert.equal(t.renders(), 2);
    const serialized = JSON.stringify(meta);
    for (const sensitive of [
      t.c.connection.id,
      "token-a",
      "docs/project",
      "team/content",
      "invite",
      "tasks",
    ])
      assert.ok(!serialized.includes(sensitive));
    const before = t.f.controls.gitCalls;
    await t.f.sessions.remove(t.c.cookie, t.c.connection.id);
    t.f.controls.identityInvalid = true;
    t.f.provider.authenticate = async () => {
      throw Error("anonymous API called provider");
    };
    t.f.provider.gitTransport = async () => {
      throw Error("anonymous API called Git");
    };
    for (const path of ["metadata", "index.html", "pc-web.jpg", "mobile.jpg"])
      for (const method of ["GET", "HEAD"]) {
        const response = await publicPreviewResponse(
          new Request(`https://folio.test/${path}`, { method }),
          meta.id,
          path,
          t.store,
        );
        assert.equal(response.status, 200);
        if (method === "HEAD") assert.equal(await response.text(), "");
        if (path === "index.html")
          assert.match(
            response.headers.get("content-security-policy")!,
            /sandbox allow-scripts/,
          );
      }
    assert.equal(t.f.controls.gitCalls, before);
    assert.equal(
      (
        await publicPreviewResponse(
          new Request("https://folio.test"),
          "f".repeat(64),
          "metadata",
          t.store,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await publicPreviewResponse(
          new Request("https://folio.test"),
          meta.id,
          "../manifest.json",
          t.store,
        )
      ).status,
      404,
    );
    await t.store.withdraw(meta.id);
    assert.equal(
      (
        await publicPreviewResponse(
          new Request("https://folio.test"),
          meta.id,
          "index.html",
          t.store,
        )
      ).status,
      410,
    );
  } finally {
    await t.cleanup();
  }
});
test("publication preparation is atomic on rendering or late authorization failure and checks immutable asset hashes", async () => {
  const t = await setup();
  try {
    const failing = new PublicPreviews(
      t.root,
      new ThumbnailCache(join(t.root, "failure-cache"), async () => {
        t.f.controls.deny.add("1");
        return Buffer.from([255, 216, 255, 217]);
      }),
    );
    await assert.rejects(
      () =>
        t.service.read(t.c.cookie, t.c.connection.id, t.key, (ctx) =>
          failing.prepare(ctx, { entry: "screen" }, DEFAULT_LIMITS),
        ),
      { code: "READ_DENIED" },
    );
    assert.deepEqual(await readdir(join(t.root, "versions")), []);
    t.f.controls.deny.clear();
    const meta = await t.prepare();
    await writeFile(
      join(t.root, "versions", meta.id, "index.html"),
      "tampered",
    );
    assert.equal(
      (
        await publicPreviewResponse(
          new Request("https://folio.test"),
          meta.id,
          "index.html",
          t.store,
        )
      ).status,
      503,
    );
  } finally {
    await t.cleanup();
  }
});
test("hosted publications retain only fixed public references for internal and external hosting", async () => {
  const t = await setup();
  try {
    for (const url of [
      "https://folio.test/prototype-assets/" +
        "a".repeat(64) +
        "/screen/index.html",
      "https://static.example.test/fixed/screen/index.html",
    ]) {
      await t.g.put(
        "packages/prototype/prototype.json",
        JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              ...t.entry,
              artifact: {
                type: "hosted",
                version: "v1",
                url,
                sourceCommit: t.entry.artifact.sourceCommit,
                digest: "sha256:" + "b".repeat(64),
                thumbnails: [
                  {
                    device: "pc-web",
                    url: url.replace("index.html", "pc-web.png"),
                  },
                ],
              },
            },
          ],
        }),
      );
      t.g.commit();
      await t.read((ctx) => ctx.refresh(DEFAULT_LIMITS));
      const meta = await t.prepare();
      assert.equal(meta.type, "hosted");
      assert.deepEqual(meta.files, {});
      const response = await publicPreviewResponse(
        new Request("https://folio.test"),
        meta.id,
        "index.html",
        t.store,
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), url);
    }
  } finally {
    await t.cleanup();
  }
});
test("prepare HTTP requires an owned connection and same origin; published version remains after subsequent disable", async () => {
  const t = await setup();
  try {
    const request = (cookie = t.c.cookie) =>
      new Request("https://folio.test/api/repositories/prepare", {
        method: "POST",
        headers: {
          origin: "https://folio.test",
          cookie: `openfolio-session=${cookie}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectionId: t.c.connection.id,
          entry: "screen",
        }),
      });
    assert.equal(
      (
        await preparePreviewResponse(
          request(""),
          t.key,
          t.service,
          t.store,
          DEFAULT_LIMITS,
        )
      ).status,
      401,
    );
    const response = await preparePreviewResponse(
      request(),
      t.key,
      t.service,
      t.store,
      DEFAULT_LIMITS,
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.url, `/preview/${data.publication.id}`);
    await t.g.put(
      "docs/project/workflow.json",
      JSON.stringify({
        schemaVersion: 1,
        protectedBranches: ["trunk"],
        prototype: { status: "disabled" },
      }),
    );
    t.g.commit();
    await t.read((ctx) => ctx.refresh(DEFAULT_LIMITS));
    assert.equal(
      (
        await preparePreviewResponse(
          request(),
          t.key,
          t.service,
          t.store,
          DEFAULT_LIMITS,
        )
      ).status,
      409,
    );
    assert.equal(
      (await t.store.asset(data.publication.id, "index.html")).body
        ?.toString()
        .includes("Public screen"),
      true,
    );
  } finally {
    await t.cleanup();
  }
});

test("renderer changes preserve published bytes while allowing a new publication", async () => {
  const t = await setup();
  try {
    const current = await t.prepare();
    const original = t.g.git([
      "show",
      `${current.revision}:packages/prototype/preview/screen/index.html`,
    ]);
    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    const oldId = hash(
      JSON.stringify([
        1,
        t.key,
        current.revision,
        "",
        t.entry.id,
        t.entry.artifact,
        `sha256:${hash(original)}`,
      ]),
    );
    const oldDir = join(t.root, "versions", oldId),
      newDir = join(t.root, "versions", current.id);
    await cp(newDir, oldDir, { recursive: true });
    const old = {
      ...current,
      id: oldId,
      digest: `sha256:${hash(original)}`,
      files: {
        ...current.files,
        "index.html": {
          hash: hash(original),
          bytes: Buffer.byteLength(original),
        },
      },
    };
    await writeFile(join(oldDir, "manifest.json"), JSON.stringify(old));
    await writeFile(join(oldDir, "index.html"), original);
    await rm(newDir, { recursive: true });
    const updated = await t.prepare();
    assert.equal(updated.id, current.id);
    assert.notEqual(updated.id, oldId);
    assert.match(
      (await t.store.asset(updated.id, "index.html")).body!.toString(),
      /openfolio-preview-error/,
    );
    assert.equal(
      (await t.store.asset(oldId, "index.html")).body!.toString(),
      original,
    );
    await t.store.withdraw(oldId);
    assert.equal((await t.prepare()).id, current.id);
    await assert.rejects(t.store.get(oldId), { code: "PREVIEW_WITHDRAWN" });
  } finally {
    await t.cleanup();
  }
});
