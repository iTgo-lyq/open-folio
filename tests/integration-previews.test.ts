import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { repositoryFixture } from "./repositories-fixture.ts";
import { completedChange } from "./integration-fixture.ts";
import { PublicPreviews } from "../src/server/public-previews.ts";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";
import type { ReadContext } from "../src/server/repositories.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";

test("Git and hosted publications use M after integration, survive source/tag deletion and preserve previously prepared versions", async (t) => {
  const f = await repositoryFixture();
  t.after(f.cleanup);
  const read = <T>(fn: (ctx: ReadContext) => Promise<T>) =>
    f.service.read(f.c.cookie, f.c.connection.id, f.key, fn);
  const id = "preview-delivery",
    branch = `change/${id}`;
  await f.g.register({ [id]: branch });
  f.g.git(["checkout", "-b", branch]);
  const sourceCommit = f.g.git(["rev-parse", "HEAD"]),
    record = completedChange(id);
  const git = {
    id: "screen",
    title: "Git screen",
    kind: "page",
    devices: ["pc-web"],
    artifact: {
      type: "git",
      path: `${record.closure.archive.path}/previews/screen`,
      sourceCommit,
    },
  };
  const hosted = {
    id: "hosted",
    title: "Hosted screen",
    kind: "page",
    devices: ["pc-web"],
    artifact: {
      type: "hosted",
      version: "fixed-v1",
      url: "https://preview.example.test/fixed-v1/index.html",
      digest: "sha256:" + "a".repeat(64),
      sourceCommit,
      thumbnails: [
        {
          device: "pc-web",
          url: "https://preview.example.test/fixed-v1/pc.png",
        },
      ],
    },
  };
  await f.g.put(
    `${record.closure.archive.path}/change.json`,
    JSON.stringify({ ...record, previews: [git, hosted] }),
  );
  await f.g.put(
    `${git.artifact.path}/index.html`,
    "<!doctype html><html><head><meta charset=utf-8></head><body>Fixed delivery</body></html>",
  );
  f.g.git(["rm", `docs/project/changes/${id}/change.json`]);
  const source = f.g.commit();
  await read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const root = join(f.f.root, "public");
  const publications = new PublicPreviews(
    root,
    new ThumbnailCache(join(root, "screenshots"), async () =>
      Buffer.from([255, 216, 255, 217]),
    ),
  );
  const prepare = (entry: string, revision?: string) =>
    read((ctx) =>
      publications.prepare(
        ctx,
        { change: id, entry, revision },
        DEFAULT_LIMITS,
      ),
    );
  const before = await prepare(git.id);
  assert.equal(before.revision, source);
  f.g.git(["checkout", "develop"]);
  f.g.git([
    "merge",
    "--no-ff",
    branch,
    "-m",
    `Deliver\n\nSpecTrail-Change: ${id}`,
  ]);
  const merge = f.g.git(["rev-parse", "HEAD"]);
  f.g.git(["push", "origin", "develop"]);
  f.g.git(["tag", `spec-trail/archive-v2/${id}`, source]);
  f.g.git(["push", "origin", `refs/tags/spec-trail/archive-v2/${id}`]);
  f.g.git([
    "push",
    "origin",
    "--delete",
    branch,
    `refs/tags/spec-trail/archive-v2/${id}`,
  ]);
  f.g.git(["branch", "-d", branch]);
  f.g.git(["tag", "-d", `spec-trail/archive-v2/${id}`]);
  await read(async (ctx) => {
    await rm(ctx.store.directory(), { recursive: true, force: true });
    await ctx.refresh(DEFAULT_LIMITS);
  });
  const gitAfter = await prepare(git.id),
    hostedAfter = await prepare(hosted.id);
  assert.equal(gitAfter.revision, merge);
  assert.equal(hostedAfter.revision, merge);
  assert.equal(hostedAfter.url, hosted.artifact.url);
  assert.deepEqual(hostedAfter.thumbnails, hosted.artifact.thumbnails);
  const descriptor = await read((ctx) =>
    ctx.store.preview(ctx.project, id, undefined, DEFAULT_LIMITS),
  );
  assert.deepEqual(
    descriptor.descriptor.entries.find((entry) => entry.id === "hosted")
      ?.artifact,
    hosted.artifact,
  );
  assert.equal(
    descriptor.descriptor.entries.find((entry) => entry.id === "screen")
      ?.artifact?.sourceCommit,
    sourceCommit,
  );
  await assert.rejects(prepare(git.id, source));
  assert.match(
    (await publications.asset(before.id, "index.html")).body!.toString(),
    /Fixed delivery/,
  );
  assert.match(
    (await publications.asset(gitAfter.id, "index.html")).body!.toString(),
    /Fixed delivery/,
  );
  f.g.git([
    "commit",
    "--allow-empty",
    "-m",
    `Duplicate\n\nSpecTrail-Change: ${id}`,
  ]);
  f.g.git(["push", "origin", "develop"]);
  await read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  const invalid = await read((ctx) =>
    ctx.store.preview(ctx.project, id, merge, DEFAULT_LIMITS),
  );
  assert.equal(invalid.descriptor.failed, true);
  assert.match(invalid.descriptor.message!, /重复/);
  assert.match(
    (await publications.asset(gitAfter.id, "index.html")).body!.toString(),
    /Fixed delivery/,
  );
});

test("legacy centralized archives stay empty even with retention tags or explicit ancestor revisions", async (t) => {
  const f = await repositoryFixture();
  t.after(f.cleanup);
  const read = <T>(fn: (ctx: ReadContext) => Promise<T>) =>
    f.service.read(f.c.cookie, f.c.connection.id, f.key, fn);
  const id = "legacy-preview",
    record = completedChange(id),
    sourceCommit = f.g.git(["rev-parse", "HEAD"]);
  const artifact = {
    type: "hosted",
    sourceCommit,
    version: "old-v1",
    url: "https://preview.example.test/old/index.html",
    digest: "sha256:" + "b".repeat(64),
  };
  await f.g.put(
    `${record.closure.archive.path}/change.json`,
    JSON.stringify({
      ...record,
      previews: [
        {
          id: "page",
          title: "Old",
          kind: "page",
          devices: ["pc-web"],
          artifact,
        },
      ],
    }),
  );
  const old = f.g.commit();
  f.g.git(["tag", `spec-trail/archive-v2/${id}`]);
  f.g.git(["push", "origin", `refs/tags/spec-trail/archive-v2/${id}`]);
  await read((ctx) => ctx.refresh(DEFAULT_LIMITS));
  for (const revision of [undefined, old, sourceCommit]) {
    const result = await read((ctx) =>
      ctx.store.preview(ctx.project, id, revision, DEFAULT_LIMITS),
    );
    assert.equal(result.descriptor.entries.length, 0);
    assert.equal(result.descriptor.failed, false);
    assert.equal(result.descriptor.message, "未记录可定位的交付版本。");
  }
});
