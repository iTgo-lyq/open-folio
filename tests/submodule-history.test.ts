import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { submoduleFixture } from "./submodule-fixture.ts";
import { completedChange } from "./integration-fixture.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { PublicPreviews } from "../src/server/public-previews.ts";
import { ThumbnailCache } from "../src/server/thumbnail-cache.ts";
import type { ReadContext } from "../src/server/repositories.ts";
for (const type of ["git", "hosted"])
  test(`${type} Change artifacts retain their source graph through archive merge, module migration and revoked child access`, async (t) => {
    const f = await submoduleFixture();
    t.after(f.cleanup);
    const id = "submodule-history",
      branch = `change/${id}`,
      source = f.revision;
    await f.register({ [id]: branch });
    f.git(["checkout", "-b", branch]);
    const active = `docs/project/changes/${id}`;
    const artifact =
      type === "git"
        ? { type, path: `${active}/previews/screen`, sourceCommit: source }
        : {
            type,
            sourceCommit: source,
            version: "v1",
            url: "https://preview.test/v1/index.html",
            digest: `sha256:${"a".repeat(64)}`,
          };
    const entry = {
      id: "screen",
      title: "固定标题",
      kind: "page",
      devices: ["pc-web"],
      artifact,
    };
    await f.put(
      `${active}/change.json`,
      JSON.stringify({
        schemaVersion: 1,
        id,
        title: "History",
        branch,
        size: "small",
        status: "active",
        stage: "requirement",
        confirmations: {},
        tasks: {},
        closure: {},
        previews: [entry],
      }),
    );
    if (type === "git")
      await f.put(
        `${artifact.path}/index.html`,
        "<!doctype html><body>fixed Change A</body>",
      );
    const first = f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
    const read = (revision?: string) =>
      f.store.preview(
        f.project,
        id,
        revision,
        DEFAULT_LIMITS,
        undefined,
        "screen",
      );
    let result = await read(first);
    assert.equal(result.descriptor.entries[0].sourceAvailable, true);
    assert.equal(result.descriptor.entries[0].source!.links[0].commit, f.a);
    const root = join(f.root, "public");
    const publications = new PublicPreviews(
      root,
      new ThumbnailCache(join(root, "screens"), async () =>
        Buffer.from([255, 216, 255, 217]),
      ),
    );
    const context = {
      store: f.store,
      project: f.project,
      assertRead: async () => {},
      lease: { context: { signal: AbortSignal.timeout(30_000) } },
    } as unknown as ReadContext;
    const publication = await publications.prepare(
      context,
      { change: id, entry: "screen" },
      DEFAULT_LIMITS,
    );
    const before = await publications.asset(publication.id, "index.html");
    const record = completedChange(id, branch),
      path = record.closure.archive.path;
    const archivedEntry =
      type === "git"
        ? {
            ...entry,
            artifact: { ...artifact, path: `${path}/previews/screen` },
          }
        : entry;
    await f.put(
      `${path}/change.json`,
      JSON.stringify({ ...record, previews: [archivedEntry] }),
    );
    if (type === "git")
      await f.put(
        `${path}/previews/screen/index.html`,
        "<!doctype html><body>fixed Change A</body>",
      );
    f.git(["rm", "-r", active]);
    f.commit();
    f.git(["checkout", "develop"]);
    f.git(["merge", "--no-ff", branch, "-m", "Merge fixed history"]);
    f.git(["push", "origin", "develop"]);
    const merge = f.git(["rev-parse", "HEAD"]);
    f.recordMerge(id, branch, merge);
    f.git(["push", "origin", "--delete", branch]);
    f.git(["branch", "-d", branch]);
    await f.put(
      "docs/project/workflow.json",
      JSON.stringify({
        schemaVersion: 3,
        integrationBranch: "develop",
        releaseBranch: "main",
        prototype: { status: "enabled", packagePath: "new-prototype" },
      }),
    );
    f.commit();
    await f.store.refresh(f.project, DEFAULT_LIMITS, f.context);
    result = await read();
    assert.equal(result.descriptor.revision, merge);
    assert.equal(result.descriptor.entries[0].source!.links[0].commit, f.a);
    f.deny();
    result = await read();
    assert.equal(result.descriptor.entries[0].available, true);
    assert.equal(result.descriptor.entries[0].sourceAvailable, false);
    assert.match(result.descriptor.entries[0].sourceMessage!, /无权/);
    if (type === "git") assert.match(result.html!, /fixed Change A/);
    else assert.equal(result.descriptor.entries[0].url, artifact.url);
    const opens = f.opened.length;
    const after = await publications.asset(publication.id, "index.html");
    assert.deepEqual(after.body, before.body);
    assert.equal(after.redirect, before.redirect);
    assert.equal(f.opened.length, opens);
    assert.match((await read(first)).descriptor.message!, /固定合并提交/);
  });
