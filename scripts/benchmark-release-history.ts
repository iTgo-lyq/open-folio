import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

// Reproducible local Git/Provider fixture. No real GitHub requests or artificial latency.
const implementation = resolve(process.argv[2] ?? ".");
const count = Number(process.argv[3] ?? 1000);
const root = resolve(
  process.argv[4] ?? `/tmp/openfolio-release-benchmark-${count}`,
);
const { GitReader } = (await import(
  pathToFileURL(join(implementation, "src/server/git.ts")).href
)) as typeof import("../src/server/git.ts");
const { SnapshotStore } = await import(
  pathToFileURL(join(implementation, "src/server/store.ts")).href
);
const { DEFAULT_LIMITS } = await import(
  pathToFileURL(join(implementation, "src/lib/model.ts")).href
);
const remote = join(root, "remote.git");
await mkdir(root, { recursive: true });
const git = (args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
let metadata: { prs: any[]; batches: number; documents: number };
try {
  metadata = JSON.parse(await readFile(join(root, "fixture.json"), "utf8"));
} catch {
  git(["init", "--bare", "--initial-branch=main", remote]);
  const stream: string[] = [];
  const prs: any[] = [];
  let mark = 0,
    number = 0,
    stamp = 1760000000;
  const text = (body: string) => `data ${Buffer.byteLength(body)}\n${body}\n`;
  const commit = (
    ref: string,
    parent: number | null,
    files: Record<string, string>,
    message: string,
    merged?: number,
    removed?: string,
  ) => {
    const id = ++mark;
    stream.push(
      `commit refs/heads/${ref}\nmark :${id}\ncommitter Fixture <fixture@example.test> ${stamp++} +0000\n${text(message)}`,
    );
    if (parent) stream.push(`from :${parent}\n`);
    if (merged) stream.push(`merge :${merged}\n`);
    if (removed) stream.push(`D ${removed}\n`);
    for (const [path, body] of Object.entries(files))
      stream.push(`M 100644 inline ${path}\n${text(body)}`);
    stream.push("\n");
    return id;
  };
  const makePr = (
    head: string,
    base: string,
    source: number,
    target: number,
    merge: number,
    body: string,
  ) => {
    const n = ++number;
    prs.push({
      number: n,
      title: `Delivery ${n}`,
      url: `https://github.com/benchmark/project/pull/${n}`,
      body,
      state: "merged",
      draft: false,
      base: { repositoryId: "1", branch: base, commit: target },
      head: { repositoryId: "1", branch: head, commit: source },
      mergeCommit: merge,
      mergedAt: new Date(stamp * 1000).toISOString(),
      updatedAt: new Date(stamp * 1000).toISOString(),
    });
  };
  let main = commit(
    "main",
    null,
    {
      "docs/project/workflow.json": JSON.stringify({
        schemaVersion: 3,
        integrationBranch: "develop",
        releaseBranch: "main",
      }),
      "docs/project/specs/core/spec.md": "# Core\n\nA typical project.\n",
      "package.json": '{"version":"0.1.0"}',
    },
    "Setup",
  );
  let develop = main;
  const mainFiles: Record<string, string> = {};
  let pending: string[] = [],
    batches = 0,
    documents = 2;
  const batchSizes = [20, 35, 15, 30];
  for (let i = 1; i <= count; i++) {
    const id = `change-${String(i).padStart(5, "0")}`,
      branch = `change/${id}`,
      live = `docs/project/changes/${id}`;
    const archived = `docs/project/archive/2026-10-10-${id}`;
    const medium = i % 5 === 0;
    const confirmation = {
      at: "2026-10-09T00:00:00.000Z",
      summary: "Confirmed",
    };
    const state = {
      schemaVersion: 1,
      id,
      title: `Feature ${i}`,
      size: medium ? "medium" : "small",
      status: "active",
      stage: "requirement",
      branch,
      confirmations: {},
      tasks: {},
      closure: {},
    };
    const planning = commit(
      "develop",
      develop,
      { [`${live}/change.json`]: JSON.stringify(state) },
      `Plan ${id}`,
    );
    const step = (result: string) => ({
      result,
      at: "2026-10-10T00:00:00.000Z",
      summary: "Verified",
    });
    const complete = {
      ...state,
      status: "completed",
      stage: "close",
      confirmations: medium
        ? {
            requirement: confirmation,
            technical: confirmation,
            plan: confirmation,
          }
        : {},
      tasks: { T1: { title: "Implement", status: "done" } },
      closure: {
        verification: step("passed"),
        acceptance: step("accepted"),
        specs: step("synced"),
        archive: { ...step("done"), path: archived },
      },
    };
    const files: Record<string, string> = {
      [`${archived}/change.json`]: JSON.stringify(complete),
      [`${archived}/requirement.md`]: `# Feature ${i}\n\nDeliver the requested behavior for area ${i % 12}.\n\nSee docs/project/specs/core/spec.md.\n`,
      [`${archived}/execution.md`]: `# Verification ${i}\n\nT1: implementation and integration tests passed.\n`,
      [`src/feature-${i}.txt`]: `Feature ${i}\n`,
    };
    if (medium) {
      files[`${archived}/technical.md`] =
        `# Technical ${i}\n\nReuse existing components and interfaces.\n`;
      files[`${archived}/plan.md`] =
        "# Plan\n\n## T1 Implement\n\nImplement and verify the requested behavior.\n";
    }
    const source = commit(
      branch,
      planning,
      files,
      `Implement ${id}`,
      undefined,
      live,
    );
    develop = commit(
      "develop",
      planning,
      files,
      `Merge pull request #${number + 1}`,
      source,
      live,
    );
    makePr(
      branch,
      "develop",
      source,
      planning,
      develop,
      `SpecTrail-Change: ${id}`,
    );
    Object.assign(mainFiles, files);
    documents += medium ? 5 : 3;
    pending.push(id);
    if (
      pending.length === batchSizes[batches % batchSizes.length] ||
      i === count
    ) {
      batches++;
      const version = `1.${batches}.0`;
      develop = commit(
        "develop",
        develop,
        { "package.json": JSON.stringify({ version }) },
        `Prepare ${version}`,
      );
      const before = main;
      main = commit(
        "main",
        main,
        { ...mainFiles, "package.json": JSON.stringify({ version }) },
        `Merge release ${version}`,
        develop,
      );
      makePr(
        "develop",
        "main",
        develop,
        before,
        main,
        `SpecTrail-Version: ${version}\n${pending.map((id) => `SpecTrail-Includes: ${id}`).join("\n")}`,
      );
      for (const key of Object.keys(mainFiles)) delete mainFiles[key];
      pending = [];
    }
  }
  const marksPath = join(root, "marks");
  execFileSync(
    "git",
    [
      "--git-dir",
      remote,
      "fast-import",
      "--quiet",
      `--export-marks=${marksPath}`,
    ],
    { input: stream.join(""), maxBuffer: 256 * 1024 * 1024 },
  );
  const marks = new Map(
    (await readFile(marksPath, "utf8"))
      .trim()
      .split("\n")
      .map((row) => row.split(" ") as [string, string]),
  );
  for (const pr of prs)
    for (const target of [pr, pr.head, pr.base]) {
      if (target.commit) target.commit = marks.get(`:${target.commit}`);
      if (target.mergeCommit)
        target.mergeCommit = marks.get(`:${target.mergeCommit}`);
    }
  metadata = { prs, batches, documents };
  await writeFile(join(root, "fixture.json"), JSON.stringify(metadata));
}
for (const pr of metadata.prs)
  if (pr.body.startsWith("SpecTrail-")) pr.body = `Delivery\n\n${pr.body}`;
// The legacy baseline needs valid bodies; the optimized run deliberately omits all markers.
if (process.env.BENCHMARK_UNMARKED === "1")
  for (const pr of metadata.prs) pr.body = "Deliver the completed work.";
const cache = join(root, `cache-${process.pid}`);
await rm(cache, { recursive: true, force: true });
const calls: Record<string, number> = {};
let gitMs = 0,
  transferMs = 0,
  githubRequests = 0,
  firstMs: number | undefined;
class Reader extends GitReader {
  override async run(
    args: string[],
    signal?: AbortSignal,
    limit?: number,
    input?: string | Buffer,
  ) {
    calls[args[0]] = (calls[args[0]] ?? 0) + 1;
    const start = performance.now();
    try {
      return await super.run(args, signal, limit, input);
    } finally {
      const elapsed = performance.now() - start;
      gitMs += elapsed;
      if (["fetch", "ls-remote"].includes(args[0])) transferMs += elapsed;
    }
  }
}
const store = new SnapshotStore(
  cache,
  (dir: string) => new Reader(dir, remote, "file"),
  "benchmark",
);
const project = {
  id: "benchmark",
  name: "Benchmark",
  repositoryUrl: "https://github.com/benchmark/project.git",
  integrationBranch: "develop",
};
const start = performance.now();
const timer = setInterval(async () => {
  if (firstMs !== undefined) return;
  try {
    const s = await store.snapshot(project);
    if (
      s.changes?.length === count &&
      Object.values(s.deliveryByChange ?? {}).filter(
        (d: any) => d.stage === "releaseMerged",
      ).length === count
    )
      firstMs = performance.now() - start;
  } catch {}
}, 25);
let result: any;
try {
  const snapshot = await store.refresh(
    project,
    {
      ...DEFAULT_LIMITS,
      documents: Math.max(DEFAULT_LIMITS.documents, metadata.documents + 100),
    },
    {
      signal: new AbortController().signal,
      beforePublish: async () => {},
      onCurrent: () => {
        firstMs = performance.now() - start;
      },
      delivery: {
        repositoryId: "1",
        cacheKey: "benchmark",
        list: async (query: any, cursor: string | null) => {
          githubRequests++;
          const rows = metadata.prs.filter((pr) =>
            query.commit
              ? pr.mergeCommit === query.commit
              : !query.base || pr.base.branch === query.base,
          );
          const page = Number(cursor ?? 1),
            items = rows
              .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice((page - 1) * 100, page * 100);
          return {
            items,
            nextCursor: page * 100 < rows.length ? String(page + 1) : null,
          };
        },
      },
    },
  );
  const elapsed = performance.now() - start;
  result = {
    status: "complete",
    listMs: firstMs ?? elapsed,
    historyMs: elapsed,
    changes: snapshot.changes.length,
    archived: Object.values(snapshot.deliveryByChange ?? {}).filter(
      (d: any) => d.stage === "releaseMerged",
    ).length,
  };
} catch (error) {
  result = {
    status: "failed",
    listMs: firstMs ?? null,
    historyMs: performance.now() - start,
    error: String(error),
  };
} finally {
  clearInterval(timer);
}
console.log(
  JSON.stringify({
    implementation,
    count,
    batches: metadata.batches,
    documents: metadata.documents,
    limits: {
      ...DEFAULT_LIMITS,
      documents: Math.max(DEFAULT_LIMITS.documents, metadata.documents + 100),
    },
    ...result,
    gitCalls: Object.values(calls).reduce((a, b) => a + b, 0),
    calls,
    gitMs,
    transferMs,
    githubRequests,
    network:
      "local file Git fetch included; Provider fixture has no network latency",
  }),
);
await rm(cache, { recursive: true, force: true });
