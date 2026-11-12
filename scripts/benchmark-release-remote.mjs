import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const boot = performance.now();
// Usage: node --conditions=react-server scripts/benchmark-release-remote.mjs [implementation] [env-root] [owner/repo] [repository-id] [expected-archives]
const implementation = resolve(process.argv[2] ?? ".");
const envRoot = resolve(process.argv[3] ?? implementation);
const fullName = process.argv[4] ?? "iTgo-lyq/open-folio";
const repositoryId = process.argv[5] ?? "1432892350";
const expectedArchives = Number(process.argv[6] ?? 110);
const output = await mkdtemp(join(tmpdir(), "openfolio-remote-benchmark-"));
console.log(JSON.stringify({ event: "output", directory: output }));
const data = await mkdtemp(join(output, "isolated-data-"));
const load = (path) => import(pathToFileURL(join(implementation, path)).href);
const nextEnv = (await load("node_modules/@next/env/dist/index.js")).default;
nextEnv.loadEnvConfig(envRoot, false);
const token = process.env.OPENFOLIO_VERIFY_TOKEN;
assert.ok(token, "Dedicated verification token must be configured");
// Never use the real service data, configuration or credential key paths.
process.env.OPENFOLIO_DATA_DIR = data;
process.env.OPENFOLIO_CONFIG = join(data, "config.json");
process.env.OPENFOLIO_CREDENTIAL_KEY_FILE = join(data, "credential-key");
const { GitReader } = await load("src/server/git.ts");
const { Repositories } = await load("src/server/repositories.ts");
const { PersonalSessions } = await load("src/server/personal-sessions.ts");
const { Discovery } = await load("src/server/discovery.ts");
const { GitHubProvider } = await load("src/server/providers/github.ts");
const { ProviderRegistry } = await load("src/server/providers/registry.ts");
const { repositoryKey } = await load("src/server/providers/types.ts");
const { DEFAULT_LIMITS } = await load("src/lib/model.ts");
const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: implementation,
  encoding: "utf8",
}).trim();

const codeDiff = execFileSync("git", ["diff", "--", "src"], {
  cwd: implementation,
  encoding: "utf8",
});
const { createHash } = await import("node:crypto");
const codeDiffHash = createHash("sha256").update(codeDiff).digest("hex");
const events = [];
const now = () => performance.now() - boot;
const http = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://api.github.com");
  const event = {
    kind: "github-api",
    endpoint: url.pathname + url.search,
    startMs: now(),
    bytes: 0,
    conditional: new Headers(init?.headers).has("if-none-match"),
  };
  events.push(event);
  try {
    const response = await fetch(input, init);
    event.status = response.status;
    event.headersMs = now();
    if (!response.body) {
      event.endMs = now();
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            event.endMs = now();
            controller.close();
          } else {
            event.bytes += value.byteLength;
            controller.enqueue(value);
          }
        } catch (error) {
          event.endMs = now();
          event.failed = true;
          controller.error(error);
        }
      },
      async cancel(reason) {
        event.endMs ??= now();
        await reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    event.endMs = now();
    event.failed = true;
    throw error;
  }
};
class MeasuredGitReader extends GitReader {
  async run(args, signal, limit, input) {
    assert.ok(
      this.directory.startsWith(data + "/"),
      "Git cache must stay isolated",
    );
    const event = {
      kind: "git",
      command: args[0],
      args,
      network: ["fetch", "ls-remote"].includes(args[0]),
      startMs: now(),
    };
    events.push(event);
    try {
      const result = await super.run(args, signal, limit, input);
      event.stdoutBytes = result.length;
      return result;
    } catch (error) {
      event.failed = true;
      throw error;
    } finally {
      event.endMs = now();
    }
  }
}
const provider = new GitHubProvider(http);
const sessions = new PersonalSessions(
  join(data, "sessions"),
  new ProviderRegistry([provider]),
  join(data, "credential-key"),
);
const discoveries = new Discovery(join(data, "discovery"), sessions);
const repositoryRoot = join(data, "repositories");
const service = new Repositories(
  repositoryRoot,
  sessions,
  discoveries,
  (dir, transport) => new MeasuredGitReader(dir, transport),
);
const signal = AbortSignal.timeout(180_000);
const setupStarted = now();
let benchmarkStart, listAt, historyAt, result, account, bound;
const summary = (snapshot) => {
  const archives = Object.entries(snapshot.releaseArchives ?? {}).filter(
    ([, a]) => a.status === "found",
  );
  const published = archives.map(([id]) => snapshot.deliveryByChange[id]);
  assert.equal(
    archives.length,
    expectedArchives,
    "The real release branch must still contain the expected 110 known valid archives",
  );
  assert.ok(published.every((d) => d.stage === "releaseMerged"));
  return {
    changes: snapshot.changes.length,
    documents: snapshot.documents.length,
    validReleaseArchives: archives.length,
    datedArchives: published.filter(
      (d) => d.releaseMergedPrNumber !== undefined,
    ).length,
    unknownTimeArchives: published.filter(
      (d) => d.releaseMergedPrNumber === undefined,
    ).length,
    firstIntroductionCommits: new Set(
      archives.map(([, a]) => a.introduction).filter(Boolean),
    ).size,
    historyPending: Boolean(snapshot.historyPending),
    releaseSource: snapshot.releaseSource,
    branches: snapshot.branches.map((b) => ({
      name: b.name,
      commit: b.commit,
    })),
    staleDeliveries: Object.values(snapshot.deliveryByChange ?? {}).filter(
      (d) => d.stale,
    ).length,
  };
};
try {
  // New local account/binding in the temporary directory only; no service login or writes.
  account = await sessions.register(
    "",
    "isolated-cold-benchmark",
    randomUUID(),
    signal,
  );
  bound = await sessions.bind(
    account.cookie,
    "github",
    token,
    "Cold benchmark",
    signal,
    account.session.browserRevision,
  );
  await assert.rejects(access(repositoryRoot));
  benchmarkStart = now();
  console.log(
    JSON.stringify({
      event: "cold-start",
      codeCommit,
      isolatedDirectory: data,
      cacheExists: false,
      startupAndBindingMs: benchmarkStart,
    }),
  );
  const selector = { fullName, repositoryId };
  const key = repositoryKey({
    providerId: "github",
    instanceId: "github.com",
    repositoryId: selector.repositoryId,
  });
  result = await service.readShared(
    account.session.account.id,
    bound.connection.id,
    key,
    selector,
    "develop",
    async (ctx) => {
      const first = await ctx.refresh(DEFAULT_LIMITS, false, true);
      const readable = await ctx.store.workbench(ctx.project, first.id);
      const listBodyBytes = Buffer.byteLength(JSON.stringify(readable));
      listAt = now();
      const initial = summary(readable);
      console.log(
        JSON.stringify({
          event: "list-available",
          elapsedMs: listAt - benchmarkStart,
          ...initial,
        }),
      );
      const final = await ctx.refresh(DEFAULT_LIMITS, true, false);
      const completed = await ctx.store.workbench(ctx.project, final.id);
      const historyBodyBytes = Buffer.byteLength(JSON.stringify(completed));
      historyAt = now();
      const history = summary(completed);
      assert.equal(history.historyPending, false);
      assert.equal(
        history.staleDeliveries,
        0,
        "History must complete without stale PR fallbacks",
      );
      assert.ok(
        completed.deliveryLastSuccess,
        "PR history collection must be successful",
      );
      return { initial, history, listBodyBytes, historyBodyBytes };
    },
    signal,
  );
  const pullPath = join(
    repositoryRoot,
    bound.connection.id,
    (await load("src/server/git.ts")).hash(JSON.stringify([key, "develop"])),
    "pull-requests.json",
  );
  const cache = JSON.parse(await readFile(pullPath, "utf8"));
  result.prCount = Object.keys(cache.items).length;
  result.status = "complete";
} catch (error) {
  result = {
    ...result,
    status: "failed",
    error: { code: error.code ?? error.name, message: error.message },
  };
  process.exitCode = 1;
} finally {
  const sum = (rows) =>
    rows.reduce((n, e) => n + ((e.endMs ?? e.startMs) - e.startMs), 0);
  const count = (rows) =>
    rows.reduce((map, e) => {
      map[e.command] = (map[e.command] ?? 0) + 1;
      return map;
    }, {});
  const inRun = events.filter(
    (e) => benchmarkStart !== undefined && e.startMs >= benchmarkStart,
  );
  const git = inRun.filter((e) => e.kind === "git");
  const api = inRun.filter((e) => e.kind === "github-api");
  const networkGit = git.filter((e) => e.network);
  const report = {
    measuredAt: new Date().toISOString(),
    implementation,
    codeCommit,
    codeDirty: Boolean(codeDiff),
    codeDiffHash,
    scope:
      "Fresh process, empty isolated application and bare Git caches; actual Repositories/permission/SnapshotStore/GitHubProvider code. Timed from repository read to readable workbench; includes Git HTTPS fetch, real GitHub API bodies, parsing, validation, and file publication. Excludes Next.js server/browser startup and initial local account/token binding. No OS/DNS cache purge. Existing service data untouched.",
    limits: DEFAULT_LIMITS,
    startupAndBindingMs: benchmarkStart ?? null,
    accountAndBindingMs:
      benchmarkStart === undefined ? null : benchmarkStart - setupStarted,
    listMs: listAt === undefined ? null : listAt - benchmarkStart,
    historyMs: historyAt === undefined ? null : historyAt - benchmarkStart,
    historyAfterListMs:
      historyAt === undefined || listAt === undefined
        ? null
        : historyAt - listAt,
    ...result,
    gitCalls: git.length,
    gitCallsByCommand: count(git),
    gitElapsedSumMs: sum(git),
    gitNetworkCommands: networkGit.length,
    gitNetworkByCommand: count(networkGit),
    gitNetworkElapsedSumMs: sum(networkGit),
    githubApiRequests: api.length,
    githubApiElapsedSumMs: sum(api),
    githubApiResponseBytes: api.reduce((n, e) => n + e.bytes, 0),
    githubPrRequests: api.filter((e) => /\/pulls(?:\?|$)/.test(e.endpoint))
      .length,
    requestsBeforeList: {
      git: git.filter((e) => e.startMs <= listAt).length,
      githubApi: api.filter((e) => e.startMs <= listAt).length,
    },
    setupApiRequests: events.filter(
      (e) =>
        e.kind === "github-api" &&
        (benchmarkStart === undefined || e.startMs < benchmarkStart),
    ).length,
    events,
  };
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  // Remove ephemeral credentials, keys and all rebuilt caches; keep only code and metrics.
  await rm(data, { recursive: true, force: true });
  await assert.rejects(access(data));
  await writeFile(
    join(output, "cleanup.json"),
    JSON.stringify({
      isolatedDataRemoved: true,
      productionDataAccessed: false,
    }) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: "finished",
      ...Object.fromEntries(
        Object.entries(report).filter(
          ([key]) =>
            !["events", "scope", "limits", "initial", "history"].includes(key),
        ),
      ),
      isolatedDataRemoved: true,
    }),
  );
}
