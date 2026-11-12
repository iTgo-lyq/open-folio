import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import {
  collectReleaseVersions,
  RELEASE_TAG_TTL_MS,
  versionFromFile,
  versionsFromTags,
} from "../src/server/release-versions.ts";

test("read static project versions, including Cargo workspaces and legacy Poetry", () => {
  for (const [path, body, expected] of [
    [
      "package.json",
      '{"version":"1.2.3","dependencies":{"x":"9.9.9"}}',
      "1.2.3",
    ],
    [
      "Cargo.toml",
      '[package]\nversion = "2.3.4"\nrust-version="1.85"',
      "2.3.4",
    ],
    ["Cargo.toml", '[workspace.package]\nversion = "3.4.5"', "3.4.5"],
    [
      "Cargo.toml",
      '[package]\nversion.workspace = true\n[workspace.package]\nversion="3.4.5"',
      "3.4.5",
    ],
    ["pyproject.toml", '[project]\nversion="1.2.0rc1"', "1.2.0rc1"],
    ["pyproject.toml", '[tool.poetry]\nversion="1.2.0"', "1.2.0"],
    [
      "pubspec.yaml",
      "version: 1.2.3+42\nenvironment:\n  sdk: ^3.0.0",
      "1.2.3+42",
    ],
    [
      "pom.xml",
      '<project xmlns="http://maven.apache.org/POM/4.0.0"><parent><version>9.9.9</version></parent><version>1.2.3</version></project>',
      "1.2.3",
    ],
    ["VERSION", "v1.2.3\n", "1.2.3"],
    ["version.txt", " 1.2.3-beta.1+build.2\n", "1.2.3-beta.1+build.2"],
  ])
    assert.equal(versionFromFile(path, body), expected, path);
});

test("do not invent versions from dependencies, toolchains, dynamic or malformed manifests", () => {
  for (const [path, body] of [
    [
      "go.mod",
      "module example.test/app\ngo 1.23\nrequire example.test/lib v1.2.3",
    ],
    ["package.json", '{"dependencies":{"x":"1.2.3"}}'],
    ["package.json", '{"version":42}'],
    ["package.json", '{"version":"${VERSION}"}'],
    ["Cargo.toml", '[dependencies]\nexample="1.2.3"'],
    ["Cargo.toml", '[package]\nrust-version="1.85"'],
    ["Cargo.toml", '[package]\nversion="1.2.3"\nversion="2.3.4"'],
    [
      "pyproject.toml",
      '[project]\ndynamic=["version"]\n[tool.poetry]\nversion="1.2.3"',
    ],
    ["pubspec.yaml", "version: 1.2.3\nversion: 2.3.4"],
    ["pom.xml", "<project><version>${revision}</version></project>"],
    ["pom.xml", "<project><parent><version>1.2.3</version></parent></project>"],
    [
      "pom.xml",
      '<!DOCTYPE project [<!ENTITY v "1.2.3">]><project><version>&v;</version></project>',
    ],
    ["VERSION", "1.2.3\n2.3.4"],
  ])
    assert.equal(versionFromFile(path, body), undefined, `${path}: ${body}`);
});

const first = "a".repeat(40),
  second = "b".repeat(40),
  tagObject = "c".repeat(40);
test("common lightweight and peeled annotated tag forms match only exact commits", () => {
  for (const tag of [
    "v1.2.3",
    "1.2.3",
    "release-1.2.3",
    "release/v1.2.3",
    "release/v1.2.3-rc.1+build.2",
  ]) {
    const expected = tag.includes("rc.1") ? "1.2.3-rc.1+build.2" : "1.2.3";
    for (const body of [
      `${first}\trefs/tags/${tag}\n`,
      `${tagObject}\trefs/tags/${tag}\n${first}\trefs/tags/${tag}^{}\n`,
    ])
      assert.deepEqual(versionsFromTags(body, [first, second]), {
        [first]: { status: "found", version: expected },
        [second]: { status: "missing" },
      });
  }
  assert.deepEqual(
    versionsFromTags(
      `${first}\trefs/tags/pkg/v1.2.3\n${first}\trefs/tags/test-1.2.3\n`,
      [first],
    ),
    { [first]: { status: "missing" } },
  );
  assert.deepEqual(
    versionsFromTags(
      `${first}\trefs/tags/v1.2.3\n${first}\trefs/tags/release-1.2.3\n`,
      [first],
    ),
    { [first]: { status: "found", version: "1.2.3" } },
  );
  assert.deepEqual(
    versionsFromTags(
      `${first}\trefs/tags/v1.2.3\n${first}\trefs/tags/v2.3.4\n`,
      [first],
    ),
    { [first]: { status: "ambiguous" } },
  );
});

function readerFixture(manifests: Record<string, Record<string, string>>) {
  const calls: string[][] = [];
  const blobs = new Map<string, string>();
  let tags = "",
    fail = false;
  return {
    calls,
    setTags: (body: string) => {
      tags = body;
    },
    fail: (value: boolean) => {
      fail = value;
    },
    async run(args: string[]) {
      calls.push(args);
      if (fail) throw Error("offline");
      if (args[0] === "ls-remote") return Buffer.from(tags);
      if (args[0] === "cat-file") return Buffer.from(blobs.get(args[2])!);
      assert.equal(args[0], "ls-tree");
      return Buffer.from(
        Object.entries(manifests[args[3]] ?? {})
          .map(([path, body]) => {
            const blob = String(blobs.size + 1).padStart(40, "0");
            blobs.set(blob, body);
            return `100644 blob ${blob} ${Buffer.byteLength(body)}\t${path}\0`;
          })
          .join(""),
      );
    },
  };
}
const signal = () => new AbortController().signal;

test("commit versions and negative file results persist, with one read per unique commit", async () => {
  const reader = readerFixture({
    [first]: { "package.json": '{"version":"1.2.3"}' },
    [second]: { VERSION: "2.3.4" },
  });
  const a = await collectReleaseVersions(
    reader,
    [first, second, first],
    DEFAULT_LIMITS,
    signal(),
  );
  assert.equal(a.versions[first].version, "1.2.3");
  assert.equal(a.versions[second].version, "2.3.4");
  assert.equal(reader.calls.filter((args) => args[0] === "ls-tree").length, 2);
  assert.equal(
    reader.calls.filter((args) => args[0] === "ls-remote").length,
    0,
  );
  reader.calls.length = 0;
  const b = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    JSON.parse(JSON.stringify(a.cache)),
  );
  assert.deepEqual(reader.calls, []);
  assert.deepEqual(Object.keys(b.cache.files), [first]);
});

test("file conflicts are not hidden by tags; matching file versions deduplicate", async () => {
  const reader = readerFixture({
    [first]: { "package.json": '{"version":"1.2.3"}', VERSION: "2.3.4" },
    [second]: { VERSION: "v1.2.3", "version.txt": "1.2.3" },
  });
  reader.setTags(`${first}\trefs/tags/v9.9.9`);
  const a = await collectReleaseVersions(
    reader,
    [first, second],
    DEFAULT_LIMITS,
    signal(),
  );
  assert.deepEqual(a.versions[first], { status: "ambiguous" });
  assert.equal(a.versions[second].version, "1.2.3");
  assert.equal(
    reader.calls.some((args) => args[0] === "ls-remote"),
    false,
  );
});

test("tag negative cache survives restart and refreshes added, moved and deleted tags after TTL", async () => {
  const reader = readerFixture({});
  const collect = (
    cache?: Awaited<ReturnType<typeof collectReleaseVersions>>["cache"],
    now = 1000,
  ) =>
    collectReleaseVersions(
      reader,
      [first, second],
      DEFAULT_LIMITS,
      signal(),
      cache && JSON.parse(JSON.stringify(cache)),
      now,
    );
  const a = await collect();
  assert.deepEqual(a.versions[first], { status: "missing" });
  reader.setTags(
    `${tagObject}\trefs/tags/release/v1.2.3\n${first}\trefs/tags/release/v1.2.3^{}\n`,
  );
  reader.calls.length = 0;
  const b = await collect(a.cache);
  assert.deepEqual(reader.calls, []);
  assert.deepEqual(b.versions[first], { status: "missing" });
  const c = await collect(b.cache, 1000 + RELEASE_TAG_TTL_MS);
  assert.equal(c.versions[first].version, "1.2.3");
  assert.equal(reader.calls.length, 1);
  assert.equal(reader.calls[0][0], "ls-remote");
  reader.setTags(`${second}\trefs/tags/release/v1.2.3\n`);
  const d = await collect(c.cache, 1000 + 2 * RELEASE_TAG_TTL_MS);
  assert.deepEqual(d.versions[first], { status: "missing" });
  assert.equal(d.versions[second].version, "1.2.3");
  reader.setTags("");
  const e = await collect(d.cache, 1000 + 3 * RELEASE_TAG_TTL_MS);
  assert.deepEqual(e.versions[second], { status: "missing" });
});

test("read failures are retried and cancellation propagates", async () => {
  const reader = readerFixture({ [first]: { VERSION: "1.2.3" } });
  reader.fail(true);
  const a = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
  );
  assert.equal(a.versions[first].status, "unavailable");
  reader.fail(false);
  const b = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    a.cache,
  );
  assert.equal(b.versions[first].version, "1.2.3");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    collectReleaseVersions(
      reader,
      [first],
      DEFAULT_LIMITS,
      controller.signal,
      b.cache,
    ),
  );
});

test("unreadable manifests cannot be overridden by tags or smaller files and are cached", async () => {
  const reader = readerFixture({
    [first]: {
      "package.json": JSON.stringify({
        version: "2.0.0",
        padding: "x".repeat(300_000),
      }),
      VERSION: "1.2.3",
    },
  });
  reader.setTags(`${first}\trefs/tags/v1.2.3`);
  const result = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
  );
  assert.deepEqual(result.versions[first], { status: "unreadable" });
  assert.equal(
    reader.calls.some((args) => args[0] === "ls-remote"),
    false,
  );
  reader.calls.length = 0;
  const cached = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    result.cache,
  );
  assert.deepEqual(cached.versions, result.versions);
  assert.deepEqual(reader.calls, []);
});

test("a symbolic link named as a version file is not treated as a missing manifest", async () => {
  const reader = {
    async run() {
      return Buffer.from(`120000 blob ${second} 12\tpackage.json\0`);
    },
  };
  const result = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
  );
  assert.deepEqual(result.versions[first], { status: "unreadable" });
});

test("tag outages are retried without discarding static file cache", async () => {
  const reader = readerFixture({});
  const a = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    undefined,
    1000,
  );
  reader.fail(true);
  const b = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    a.cache,
    1000 + RELEASE_TAG_TTL_MS,
  );
  assert.deepEqual(b.versions[first], { status: "unavailable" });
  assert.deepEqual(b.cache.files, a.cache.files);
  reader.fail(false);
  reader.calls.length = 0;
  reader.setTags(`${first}\trefs/tags/v1.2.3`);
  const c = await collectReleaseVersions(
    reader,
    [first],
    DEFAULT_LIMITS,
    signal(),
    b.cache,
    1001 + RELEASE_TAG_TTL_MS,
  );
  assert.equal(c.versions[first].version, "1.2.3");
  assert.equal(reader.calls.length, 1);
  assert.equal(reader.calls[0][0], "ls-remote");
});
