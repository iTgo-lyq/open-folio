import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderPullRequest } from "../src/server/providers/types.ts";

export function githubWire(pr: ProviderPullRequest) {
  const ref = (value: ProviderPullRequest["head"]) => ({
    ref: value.branch,
    sha: value.commit,
    repo: value.repositoryId ? { id: Number(value.repositoryId) } : null,
  });
  return {
    number: pr.number,
    body: pr.body,
    state: pr.state === "merged" ? "closed" : pr.state,
    merged_at: pr.state === "merged" ? pr.updatedAt : null,
    merge_commit_sha: pr.mergeCommit,
    head: ref(pr.head),
    base: ref(pr.base),
  };
}

/** A real CLI boundary with local Git transport and an explicit platform response. */
export async function githubCli(
  f: { root: string; remote: string; git: (args: string[]) => string },
  prs: ProviderPullRequest[] = [],
) {
  const bin = join(f.root, "bin"),
    data = join(f.root, "github-prs.json");
  await mkdir(bin, { recursive: true });
  await writeFile(data, JSON.stringify(prs.map(githubWire)));
  await writeFile(
    join(bin, "gh"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.argv.at(-1);
if (path === 'repos/demo/work') console.log(JSON.stringify({id:1,full_name:'demo/work'}));
else if (path.startsWith('repos/demo/work/pulls?')) console.log(fs.readFileSync(${JSON.stringify(data)},'utf8'));
else process.exit(1);
`,
    { mode: 0o755 },
  );
  f.git([
    "config",
    `url.${f.remote}.insteadOf`,
    "https://github.com/demo/work.git",
  ]);
  f.git(["remote", "set-url", "origin", "https://github.com/demo/work.git"]);
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}
