import type {
  DocumentRef,
  Limits,
  ReleaseSource,
  ReleaseArchive,
} from "../lib/model.ts";
import { primaryRecord } from "../lib/model.ts";
import { indexChanges } from "./changes.ts";
import type { GitReader } from "./git.ts";
import { INTEGRATION_VERSION } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";

/** Inspect only known Changes; the release branch does not discover new entries. */
export async function collectReleaseArchives(
  reader: Pick<GitReader, "run">,
  source: ReleaseSource,
  ids: string[],
  limits: Limits,
  signal: AbortSignal,
): Promise<Record<string, ReleaseArchive>> {
  if (!source.branch || !source.commit || !ids.length) return {};
  const branch = source.branch;
  const wanted = new Set(ids);
  const blobs = new Map<string, Buffer>();
  let bytes = 0;
  const read = async (commit: string) => {
    const rows = (
      await reader.run(
        [
          "ls-tree",
          "-rlz",
          "--full-tree",
          commit,
          "--",
          "docs/project/archive/",
          "docs/project/changes/",
        ],
        signal,
      )
    )
      .toString()
      .split("\0");
    const documents: DocumentRef[] = [];
    for (const row of rows) {
      const tab = row.indexOf("\t");
      if (tab < 0) continue;
      const path = row.slice(tab + 1);
      const directory = /^docs\/project\/(archive|changes)\/([^/]+)\//.exec(
        path,
      );
      if (!directory) continue;
      const id =
        directory[1] === "archive" ? directory[2].slice(11) : directory[2];
      if (!wanted.has(id)) continue;
      const json = path === `${directory[0]}change.json`;
      const metadata =
        directory[1] === "archive" &&
        (json || path === `${directory[0]}plan.md`);
      // Any live file prevents a valid archive, without reading its contents.
      if (!metadata && directory[1] !== "changes") continue;
      if (documents.length >= limits.documents)
        throw Error("Release document limit");
      const [mode, kind, blob, sizeText] = row
        .slice(0, tab)
        .trim()
        .split(/\s+/);
      const size = Number(sizeText);
      const max = json ? limits.jsonBytes : limits.markdownBytes;
      let readable =
        metadata &&
        kind === "blob" &&
        ["100644", "100755"].includes(mode) &&
        Number.isSafeInteger(size) &&
        size <= max;
      if (readable && !blobs.has(blob)) {
        bytes += size;
        if (bytes > limits.totalBytes) throw Error("Release content limit");
        const body = await reader.run(
          ["cat-file", "blob", blob],
          signal,
          max + 1024,
        );
        blobs.set(blob, body);
      }
      if (readable) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(blobs.get(blob)!);
        } catch {
          readable = false;
        }
      }
      documents.push({
        id: `${commit}:${path}`,
        branch,
        commit,
        path,
        blob,
        bytes: size,
        kind: json ? "json" : metadata ? "markdown" : "unsupported",
        title: path,
        headings: [],
        readable,
        diagnostics: [],
      });
    }
    const entries = new Map<string, string>();
    for (const doc of documents) {
      const location =
        /^docs\/project\/archive\/\d{4}-\d{2}-\d{2}-([a-z0-9]+(?:-[a-z0-9]+)*)\/change\.json$/.exec(
          doc.path,
        );
      if (location) entries.set(location[1], doc.path);
    }
    return indexChanges(
      {
        integrationBranch: branch,
        releaseSource: source,
        branches: [{ name: branch, commit }],
        documents,
        blobs,
        routes: [...entries].map(([id, entryPath]) => ({
          id,
          entryPath,
          branch,
          kind: "archive",
          errors: [],
        })),
        sourceDiagnostics: [],
        unchanged: false,
        integrations: {
          version: INTEGRATION_VERSION,
          tip: null,
          complete: false,
          records: {},
          issues: [],
        },
      },
      {
        ancestor: async () => false,
        changeCreations: async () => new Map(),
        changeParticipants: async () => new Map(),
      },
      signal,
      true,
    );
  };
  let current;
  try {
    current = await read(source.commit);
  } catch {
    signal.throwIfAborted();
    return Object.fromEntries(
      ids.map((id) => [
        id,
        {
          status: "unavailable",
          message: "发布分支归档暂不可核实。",
        },
      ]),
    );
  }
  const result: Record<string, ReleaseArchive> = Object.fromEntries(
    current.map((group) => [
      group.id,
      primaryRecord(group)?.validCompleted
        ? { status: "found" }
        : {
            status: "invalid",
            message: "发布分支中的 Change 归档无效或存在重复记录。",
          },
    ]),
  );
  const pending = new Set(
    Object.keys(result).filter((id) => result[id].status === "found"),
  );
  if (!pending.size) return result;
  try {
    // First-parent traversal identifies entry into the release branch, rather
    // than the original archive commit in the merged development history.
    const history = (
      await reader.run(
        [
          "log",
          "--first-parent",
          "--full-history",
          "--reverse",
          "--format=%x00%H%x00",
          "--name-only",
          "-z",
          "--no-renames",
          "--diff-merges=first-parent",
          source.commit,
          "--",
          "docs/project/archive/",
          "docs/project/changes/",
        ],
        signal,
      )
    )
      .toString()
      .split("\0")
      .map((part) => part.trim())
      .filter(Boolean);
    const commits: { commit: string; paths: string[] }[] = [];
    for (const part of history) {
      if (/^[a-f0-9]{40,64}$/.test(part))
        commits.push({ commit: part, paths: [] });
      else commits.at(-1)?.paths.push(part);
    }
    const seen = new Set<string>();
    for (const { commit, paths } of commits) {
      let relevant = false;
      for (const path of paths) {
        const archive =
          /^docs\/project\/archive\/\d{4}-\d{2}-\d{2}-([^/]+)\/(change\.json|plan\.md)$/.exec(
            path,
          );
        if (archive && wanted.has(archive[1])) {
          seen.add(archive[1]);
          relevant = true;
        }
        const live = /^docs\/project\/changes\/([^/]+)\//.exec(path);
        if (live && wanted.has(live[1]) && seen.has(live[1])) relevant = true;
      }
      if (!relevant) continue;
      for (const group of commit === source.commit
        ? current
        : await read(commit)) {
        if (pending.has(group.id) && primaryRecord(group)?.validCompleted) {
          result[group.id].introduction = commit;
          pending.delete(group.id);
        }
      }
      if (!pending.size) break;
    }
  } catch {
    signal.throwIfAborted();
    // Current snapshot validity remains authoritative even without provenance.
  }
  for (const id of pending)
    result[id].message = "已核实发布归档，首次合入历史暂不可核实。";
  return result;
}
