import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  configPath,
  dataDirectory,
  readConfig,
  readConfigSnapshot,
  saveConfig,
} from "../src/server/config.ts";
import { login } from "../src/server/access.ts";
import { GET, PUT } from "../src/app/api/config/route.ts";

const empty = { schemaVersion: 1, projects: [] };
const configured = {
  schemaVersion: 1,
  projects: [
    {
      id: "example",
      name: "Example",
      repositoryUrl: "https://example.com/team/repo.git",
      inviteCode: "test-invitation",
    },
  ],
  limits: { refreshMs: 30000 },
};
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "openfolio-config-"));
  const before = {
    OPENFOLIO_CONFIG: process.env.OPENFOLIO_CONFIG,
    OPENFOLIO_DATA_DIR: process.env.OPENFOLIO_DATA_DIR,
  };
  delete process.env.OPENFOLIO_CONFIG;
  process.env.OPENFOLIO_DATA_DIR = join(root, "data");
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
let credential = "";
const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: credential },
      body: JSON.stringify(body),
    }),
  );

test("configuration and data paths have defaults, with explicit paths taking precedence", async (t) => {
  await setup(t);
  delete process.env.OPENFOLIO_DATA_DIR;
  assert.equal(dataDirectory(), join(homedir(), ".local/share/open-folio"));
  assert.equal(configPath(), join(dataDirectory(), "config.json"));
  process.env.OPENFOLIO_DATA_DIR = "relative-data";
  assert.equal(configPath(), resolve("relative-data/config.json"));
  process.env.OPENFOLIO_CONFIG = "relative-config/settings.json";
  assert.equal(configPath(), resolve("relative-config/settings.json"));
});

test("concurrent first reads publish a complete private empty config without overwriting an existing file", async (t) => {
  const root = await setup(t);
  const states = await Promise.all(
    Array.from({ length: 20 }, () => readConfigSnapshot()),
  );
  assert.ok(states.every((state) => state.revision === states[0].revision));
  assert.deepEqual(states[0].config, empty);
  assert.deepEqual(JSON.parse(await readFile(configPath(), "utf8")), empty);
  assert.equal((await stat(configPath())).mode & 0o777, 0o600);
  assert.equal((await stat(dataDirectory())).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(dataDirectory()), ["config.json"]);
  process.env.OPENFOLIO_CONFIG = join(
    root,
    "nested",
    "config",
    "settings.json",
  );
  assert.deepEqual(await readConfig(), empty);
  await writeFile(configPath(), JSON.stringify(configured));
  assert.deepEqual(await readConfig(), configured);
});

test("saving persists valid configuration and serializes concurrent edits with the same revision", async (t) => {
  await setup(t);
  const first = await readConfigSnapshot();
  const attempts = await Promise.allSettled([
    saveConfig(configured, first.revision),
    saveConfig({ ...configured, limits: { branches: 8 } }, first.revision),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = attempts.find((r) => r.status === "rejected");
  assert.equal(rejected?.reason.code, "CONFIG_CONFLICT");
  assert.deepEqual(await readConfig(), configured);
  const saved = await readConfigSnapshot();
  assert.notEqual(saved.revision, first.revision);
  assert.deepEqual(await readdir(dataDirectory()), ["config.json"]);
  await writeFile(configPath(), JSON.stringify(empty));
  await assert.rejects(saveConfig(configured, saved.revision), {
    code: "CONFIG_CONFLICT",
  });
  assert.deepEqual(await readConfig(), empty);
});

test("obsolete prototype origins are ignored on read and removed on save", async (t) => {
  await setup(t);
  await readConfig();
  const legacy = {
    ...configured,
    projects: [
      {
        ...configured.projects[0],
        prototypeOrigins: ["not an origin", "http://local/path"],
      },
    ],
  };
  await writeFile(configPath(), JSON.stringify(legacy));
  const loaded = await readConfigSnapshot();
  assert.deepEqual(loaded.config, configured);
  assert.deepEqual(JSON.parse(await readFile(configPath(), "utf8")), legacy);
  await saveConfig(legacy, loaded.revision);
  assert.deepEqual(
    JSON.parse(await readFile(configPath(), "utf8")),
    configured,
  );
});

test("invalid fields and malformed files preserve original bytes, and absent files cannot be silently recreated by save", async (t) => {
  await setup(t);
  const first = await readConfigSnapshot();
  const original = await readFile(configPath(), "utf8");
  for (const config of [
    {
      ...configured,
      projects: [...configured.projects, ...configured.projects],
    },
    {
      ...configured,
      projects: [
        { ...configured.projects[0], repositoryUrl: "file:///etc/passwd" },
      ],
    },
    {
      ...configured,
      projects: [{ ...configured.projects[0], repositoryUrl: "invalid url" }],
    },
    { ...configured, limits: { refreshMs: -1 } },
    { ...configured, limits: { refreshMs: 1.5 } },
    { ...configured, unexpected: true },
  ]) {
    await assert.rejects(saveConfig(config, first.revision), {
      code: "CONFIG_INVALID",
      status: 400,
    });
    assert.equal(await readFile(configPath(), "utf8"), original);
  }
  await writeFile(configPath(), "{broken");
  await assert.rejects(readConfig(), { code: "CONFIG_INVALID_JSON" });
  await assert.rejects(saveConfig(configured, first.revision), {
    code: "CONFIG_INVALID_JSON",
  });
  assert.equal(await readFile(configPath(), "utf8"), "{broken");
  await rm(configPath());
  await assert.rejects(saveConfig(configured, first.revision), {
    code: "CONFIG_CONFLICT",
  });
  await assert.rejects(stat(configPath()), { code: "ENOENT" });
});

test("unreadable paths and unwritable directories return actionable errors without changing data", async (t) => {
  const root = await setup(t);
  process.env.OPENFOLIO_CONFIG = root;
  await assert.rejects(readConfig(), { code: "CONFIG_UNREADABLE" });
  process.env.OPENFOLIO_CONFIG = join(root, "parent", "config.json");
  await writeFile(join(root, "parent"), "not a directory");
  await assert.rejects(readConfig(), { code: "CONFIG_UNREADABLE" });
  if (process.getuid?.() === 0) return;
  process.env.OPENFOLIO_CONFIG = join(root, "locked", "config.json");
  await mkdir(dirname(configPath()), { mode: 0o500 });
  try {
    await assert.rejects(readConfig(), { code: "CONFIG_UNWRITABLE" });
  } finally {
    await chmod(dirname(configPath()), 0o700);
  }
  const first = await readConfigSnapshot();
  const original = await readFile(configPath(), "utf8");
  await chmod(dirname(configPath()), 0o500);
  try {
    await assert.rejects(saveConfig(configured, first.revision), {
      code: "CONFIG_UNWRITABLE",
    });
    assert.equal(await readFile(configPath(), "utf8"), original);
  } finally {
    await chmod(dirname(configPath()), 0o700);
  }
});

test("an explicitly linked configuration updates its target while preserving the link", async (t) => {
  const root = await setup(t);
  const first = await readConfigSnapshot();
  const originalPath = configPath();
  const linkedPath = join(root, "linked.json");
  await symlink(originalPath, linkedPath);
  process.env.OPENFOLIO_CONFIG = linkedPath;
  await saveConfig(configured, first.revision);
  assert.deepEqual(
    JSON.parse(await readFile(originalPath, "utf8")),
    configured,
  );
  assert.equal((await lstat(linkedPath)).isSymbolicLink(), true);
});

test("config API reads, saves, rejects stale versions and enforces bounded JSON input", async (t) => {
  await setup(t);
  const request = new Request("http://localhost/api/config");
  const { adminPassword } = await import("../src/server/access.ts");
  credential = (await login(request, await adminPassword())).split(";")[0];
  const response = await GET(
    new Request(request, { headers: { cookie: credential } }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const first = await response.json();
  assert.deepEqual(first.config, empty);
  assert.equal(first.path, configPath());
  assert.equal(first.defaults.refreshMs, 120000);
  assert.equal(
    (await put({ config: configured, revision: first.revision })).status,
    200,
  );
  assert.equal(
    (await put({ config: empty, revision: first.revision })).status,
    409,
  );
  assert.equal((await put({ config: empty })).status, 400);
  assert.equal(
    (
      await put({
        config: empty,
        revision: first.revision,
        path: "/tmp/override",
      })
    ).status,
    400,
  );
  for (const [contentType, body, expected] of [
    ["text/plain", "{}", 415],
    ["application/json", "{bad", 400],
    ["application/json", " ".repeat(1024 * 1024 + 1), 413],
  ] as const) {
    const result = await PUT(
      new Request("http://localhost/api/config", {
        method: "PUT",
        headers: { "content-type": contentType, cookie: credential },
        body,
      }),
    );
    assert.equal(result.status, expected);
  }
  assert.deepEqual(await readConfig(), configured);
});
