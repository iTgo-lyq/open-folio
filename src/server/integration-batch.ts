import type { GitReader } from "./git.ts";
import type { IntegrationRecord } from "../lib/model.ts";

/** Normal merges introduce their own immutable archive. Read all requested boundaries once. */
export async function integrationBatch(
  reader: Pick<GitReader, "run">,
  commits: string[],
  signal: AbortSignal,
) {
  const records = new Map<string, Map<string, IntegrationRecord>>();
  if (!commits.length) return records;
  const body = await reader.run(
    [
      "log",
      "--no-walk=unsorted",
      // A record separator keeps a single-parent %P from looking like a new commit.
      "--format=%x1e%H%x00%P%x00%cI%x00%s%x00",
      "--raw",
      "--no-abbrev",
      "-z",
      "--no-renames",
      "--diff-filter=A",
      "--diff-merges=first-parent",
      ...new Set(commits),
      "--",
      "docs/project/archive/",
    ],
    signal,
  );
  for (const section of body.toString().split("\x1e").slice(1)) {
    const [commit, parents = "", committedAt, title, ...paths] =
      section.split("\0");
    const [base, source, extra] = parents.split(" ");
    if (!base || !source || extra) continue;
    const found = new Map<string, IntegrationRecord>();
    const duplicate = new Set<string>();
    for (let i = 0; i < paths.length; i++) {
      const header = paths[i].trim();
      if (!header.startsWith(":")) continue;
      const path = paths[++i];
      const mode = header.split(" ")[1];
      if (!["100644", "100755"].includes(mode)) continue;
      const match =
        /^(docs\/project\/archive\/\d{4}-\d{2}-\d{2}-([a-z0-9]+(?:-[a-z0-9]+)*))\/change\.json$/.exec(
          path,
        );
      if (!match) continue;
      if (found.has(match[2])) duplicate.add(match[2]);
      found.set(match[2], {
        status: "found",
        commit,
        base,
        source,
        committedAt,
        title,
        archivePath: match[1],
      });
    }
    for (const id of duplicate) found.delete(id);
    records.set(commit, found);
  }
  return records;
}
