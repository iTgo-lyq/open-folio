import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import {
  GitHubProvider,
  githubApiVersion,
  githubRepositoryName,
} from "../src/server/providers/github.ts";
import {
  SecretHandle,
  repositoryKey,
  type ProviderContext,
  type RepositoryProvider,
  type RepositoryIdentity,
} from "../src/server/providers/types.ts";
import {
  ProviderRegistry,
  providers,
} from "../src/server/providers/registry.ts";
const oid = (c: string) => c.repeat(40);
const source = {
  id: 12,
  name: "work",
  full_name: "demo/work",
  default_branch: "trunk",
};
const context: ProviderContext = {
  identity: {
    providerId: "github",
    instanceId: "github.com",
    subjectId: "7",
    login: "demo",
    displayName: "Demo",
  },
  secret: new SecretHandle("test-user-token"),
  signal: new AbortController().signal,
};
const pageUrl = (n: number) =>
  `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${n}`;
function mock(responses: Record<string, unknown | Response>) {
  const requests: URL[] = [];
  const provider = new GitHubProvider(async (input, init) => {
    const u = new URL(String(input));
    requests.push(u);
    assert.equal(u.origin, "https://api.github.com");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    const h = new Headers(init?.headers);
    assert.equal(h.get("authorization"), "Bearer test-user-token");
    assert.equal(h.get("X-GitHub-Api-Version"), githubApiVersion);
    const value = responses[u.pathname + u.search] ?? responses[u.pathname];
    assert.notEqual(value, undefined, `Unexpected request ${u.pathname}`);
    return value instanceof Response ? value : Response.json(value);
  });
  return { provider, requests };
}
async function repo(provider: GitHubProvider) {
  return provider.resolveRepository(context, { fullName: "demo/work" });
}
function fixture() {
  const bytes = JSON.stringify({
    schemaVersion: 1,
    protectedBranches: ["trunk"],
  });
  return {
    "/user": { id: 7, login: "demo", name: null },
    "/repos/demo/work": source,
    "/repos/demo/work/commits/trunk": {
      sha: oid("a"),
      commit: { tree: { sha: oid("b") } },
    },
    [`/repos/demo/work/git/trees/${oid("b")}`]: {
      truncated: false,
      tree: [{ path: "docs", type: "tree", mode: "040000", sha: oid("c") }],
    },
    [`/repos/demo/work/git/trees/${oid("c")}`]: {
      truncated: false,
      tree: [{ path: "project", type: "tree", mode: "040000", sha: oid("d") }],
    },
    [`/repos/demo/work/git/trees/${oid("d")}`]: {
      truncated: false,
      tree: [
        { path: "workflow.json", type: "blob", mode: "100644", sha: oid("e") },
      ],
    },
    [`/repos/demo/work/git/blobs/${oid("e")}`]: {
      encoding: "base64",
      size: Buffer.byteLength(bytes),
      content: Buffer.from(bytes).toString("base64"),
    },
  } as Record<string, unknown | Response>;
}
test("provider secrets cannot be serialized or inspected; URLs and registry are bounded", () => {
  assert.throws(() => JSON.stringify(context.secret));
  assert.ok(!inspect(context.secret).includes("test-user-token"));
  for (const value of ["", "t\noken", "a".repeat(4097)])
    assert.throws(() => new SecretHandle(value));
  assert.equal(
    githubRepositoryName("https://github.com/demo/work.git"),
    "demo/work",
  );
  for (const value of [
    "https://github.com@else.test/demo/work",
    "https://github.com/demo/work?q=1",
    "ssh://github.com/demo/work",
    "https://github.com/demo/%2e%2e",
    "https://github.com:444/demo/work",
  ])
    assert.throws(() => githubRepositoryName(value));
  assert.deepEqual(
    providers.describe().map((x) => x.id),
    ["github"],
  );
  assert.throws(() => providers.get("unknown"));
});
test("identity, normalized repositories, and forward-only pagination", async () => {
  const { provider } = mock({
    "/user": { id: 7, login: "demo" },
    "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=1":
      Response.json([source], {
        headers: { Link: `<${pageUrl(2)}>; rel="next"` },
      }),
    "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=2":
      [{ ...source, id: 13, name: "other", full_name: "org/other" }],
  });
  assert.equal(
    (await provider.authenticate(context.secret, context.signal)).subjectId,
    "7",
  );
  const first = await provider.listRepositories(context, null);
  assert.equal(first.items[0].repositoryId, "12");
  assert.equal(first.items[0].defaultBranch, "trunk");
  const last = await provider.listRepositories(context, first.nextCursor);
  assert.equal(last.nextCursor, null);
  assert.equal(last.items[0].fullName, "org/other");
  for (const cursor of [
    "https://attacker.test/user/repos",
    pageUrl(1) + "&page=2",
    "https://api.github.com/user/repos?per_page=100&page=2",
  ])
    await assert.rejects(() => provider.listRepositories(context, cursor), {
      code: "INVALID_CONTINUATION",
    });
  for (const next of [
    pageUrl(1),
    pageUrl(3),
    "https://attacker.test/user/repos",
  ]) {
    const p = mock({
      "/user/repos": Response.json([source], {
        headers: { Link: `<${next}>; rel="next"` },
      }),
    }).provider;
    await assert.rejects(() => p.listRepositories(context, null), {
      code: "INVALID_CONTINUATION",
    });
  }
});
test("workflow is read at one commit, through regular Git tree entries", async () => {
  const { provider, requests } = mock(fixture());
  const r = await repo(provider);
  await provider.assertRead(context, r);
  const result = await provider.probeWorkflow(context, r);
  assert.equal(result.kind, "file");
  if (result.kind !== "file") throw new Error();
  assert.equal(result.commit, oid("a"));
  assert.equal(
    JSON.parse(Buffer.from(result.bytes).toString()).protectedBranches[0],
    "trunk",
  );
  assert.ok(!requests.some((u) => u.pathname.includes("/contents/")));
  const transport = await provider.gitTransport(context, r);
  assert.equal(transport.url, "https://github.com/demo/work.git");
  assert.equal(transport.secret, context.secret);
  await assert.rejects(() =>
    provider.gitTransport(context, {
      ...r,
      cloneUrl: "https://attacker.test/repo.git",
    }),
  );
});
test("only tree-confirmed absence means missing; rejected contents remain unavailable", async () => {
  const f = fixture();
  f[`/repos/demo/work/git/trees/${oid("b")}`] = { truncated: false, tree: [] };
  const p = mock(f).provider;
  assert.equal((await p.probeWorkflow(context, await repo(p))).kind, "missing");
  for (const status of [403, 404]) {
    const f = fixture();
    f["/repos/demo/work/commits/trunk"] = new Response(null, { status });
    const p = mock(f).provider;
    await assert.rejects(
      () =>
        p.probeWorkflow(context, {
          providerId: "github",
          instanceId: "github.com",
          repositoryId: "12",
          fullName: "demo/work",
          displayName: "work",
          webUrl: "https://github.com/demo/work",
          cloneUrl: "https://github.com/demo/work.git",
          defaultBranch: "trunk",
        }),
      { code: "READ_DENIED" },
    );
  }
});
test("symlinks, submodules, malformed blobs, truncated trees and empty repositories", async () => {
  for (const [mode, type] of [
    ["120000", "blob"],
    ["160000", "commit"],
    ["040000", "tree"],
  ]) {
    const f = fixture();
    f[`/repos/demo/work/git/trees/${oid("d")}`] = {
      truncated: false,
      tree: [{ path: "workflow.json", mode, type, sha: oid("e") }],
    };
    const p = mock(f).provider;
    assert.deepEqual(await p.probeWorkflow(context, await repo(p)), {
      kind: "unavailable",
      reason: "WORKFLOW_INVALID",
    });
  }
  for (const change of ["tree", "blob"]) {
    const f = fixture();
    f[
      change === "tree"
        ? `/repos/demo/work/git/trees/${oid("b")}`
        : `/repos/demo/work/git/blobs/${oid("e")}`
    ] =
      change === "tree"
        ? { truncated: true, tree: [] }
        : { encoding: "base64", size: 2, content: "e30h" };
    const p = mock(f).provider;
    await assert.rejects(
      () =>
        p.probeWorkflow(context, {
          providerId: "github",
          instanceId: "github.com",
          repositoryId: "12",
          fullName: "demo/work",
          displayName: "work",
          webUrl: "https://github.com/demo/work",
          cloneUrl: "https://github.com/demo/work.git",
          defaultBranch: "trunk",
        }),
      { code: "PROVIDER_DATA_INVALID" },
    );
  }
  const f = fixture();
  f["/repos/demo/work/commits/trunk"] = new Response(null, { status: 409 });
  const p = mock(f).provider;
  assert.deepEqual(await p.probeWorkflow(context, await repo(p)), {
    kind: "empty-repository",
  });
});
test("expired identities cannot be hidden by a public repository; limits are recoverable", async () => {
  for (const [status, headers, code] of [
    [401, {}, "TOKEN_INVALID"],
    [403, {}, "DISCOVERY_DENIED"],
    [429, { "retry-after": "30" }, "RATE_LIMITED"],
    [403, { "x-ratelimit-remaining": "0" }, "RATE_LIMITED"],
  ] as const) {
    const p = mock({
      "/user/repos": new Response(null, { status, headers }),
    }).provider;
    await assert.rejects(() => p.listRepositories(context, null), { code });
  }
  const f = fixture();
  f["/user"] = new Response(null, { status: 401 });
  const p = mock(f).provider;
  await assert.rejects(
    () =>
      p.assertRead(context, {
        providerId: "github",
        instanceId: "github.com",
        repositoryId: "12",
        fullName: "demo/work",
        displayName: "work",
        webUrl: "https://github.com/demo/work",
        cloneUrl: "https://github.com/demo/work.git",
        defaultBranch: "trunk",
      }),
    { code: "TOKEN_INVALID" },
  );
});
test("stable identity survives rename, without following redirects", async () => {
  const p = mock({
    "/repos/demo/work": new Response(null, { status: 301 }),
    "/user/repos": [{ ...source, name: "renamed", full_name: "org/renamed" }],
  }).provider;
  const found = await p.resolveRepository(context, {
    fullName: "demo/work",
    repositoryId: "12",
  });
  assert.equal(found.fullName, "org/renamed");
  assert.equal(
    repositoryKey(found),
    repositoryKey(Object.assign({}, found, { fullName: "demo/work" })),
  );
  assert.notEqual(
    repositoryKey(found),
    repositoryKey({ ...found, instanceId: "elsewhere.test" }),
  );
});
test("a second provider supplies the same contract without GitHub data", async () => {
  const identity = {
    providerId: "sample",
    instanceId: "sample.test",
    subjectId: "person-a",
    login: "reader",
    displayName: "Reader",
  };
  const item: RepositoryIdentity = {
    ...identity,
    repositoryId: "opaque-key",
    fullName: "group/project",
    displayName: "Project",
    webUrl: "https://sample.test/group/project",
    cloneUrl: "https://sample.test/group/project.git",
    defaultBranch: "release",
  };
  const fake: RepositoryProvider = {
    id: "sample",
    parseRepositoryUrl: () => ({ fullName: "group/project" }),
    describeConnection: () => ({
      id: "sample",
      name: "Sample",
      instance: "sample.test",
      tokenUrl: "https://sample.test/tokens",
      permissions: ["read"],
    }),
    authenticate: async () => identity,
    listRepositories: async () => ({ items: [item], nextCursor: null }),
    resolveRepository: async () => item,
    assertRead: async () => {},
    probeWorkflow: async () => ({ kind: "missing", commit: oid("f") }),
    gitTransport: async (ctx) => ({
      url: item.cloneUrl,
      username: identity.login,
      secret: ctx.secret,
    }),
  };
  const registry = new ProviderRegistry([fake]);
  const p = registry.get("sample");
  const ctx = {
    ...context,
    identity: await p.authenticate(context.secret, context.signal),
  };
  const listed = await p.listRepositories(ctx, null);
  await p.assertRead(ctx, listed.items[0]);
  assert.equal((await p.probeWorkflow(ctx, listed.items[0])).kind, "missing");
  assert.equal((await p.gitTransport(ctx, item)).url, item.cloneUrl);
});
