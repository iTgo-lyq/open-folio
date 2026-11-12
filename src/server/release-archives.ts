import { readBlobs } from "./git-objects.ts";
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
  options: { history?: boolean; blobs?: Map<string, Buffer> } = {},
): Promise<Record<string, ReleaseArchive>> {
  if (!source.branch || !source.commit || !ids.length) return {};
  const branch = source.branch;
  const wanted = new Set(ids);
  const blobs = options.blobs ?? new Map<string, Buffer>();
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
    const needed = new Map<string, number>();
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
      if (readable && !blobs.has(blob) && !needed.has(blob)) {
        bytes += size;
        if (bytes > limits.totalBytes) throw Error("Release content limit");
        needed.set(blob, size);
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
    for (const [blob, body] of await readBlobs(reader, needed, signal))
      blobs.set(blob, body);
    for (const doc of documents)
      if (doc.readable) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(
            blobs.get(doc.blob)!,
          );
        } catch {
          doc.readable = false;
        }
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
  return options.history === false
    ? result
    : traceReleaseArchives(reader, source.commit, result, signal);
}

/** Current validity is already established. History supplies identity and provenance only. */
export async function traceReleaseArchives(
  reader: Pick<GitReader, "run">,
  commit: string,
  current: Record<string, ReleaseArchive>,
  signal: AbortSignal,
): Promise<Record<string, ReleaseArchive>> {
  const result = structuredClone(current);
  const pending = new Set(
    Object.keys(result).filter(
      (id) => result[id].status === "found" && !result[id].introduction,
    ),
  );
  if (!pending.size) return result;
  try {
    const history = (
      await reader.run(
        [
          "log",
          "--first-parent",
          "--full-history",
          "--reverse",
          "--root",
          "--format=%x00%H%x00",
          "--name-only",
          "-z",
          "--no-renames",
          "--diff-filter=A",
          "--diff-merges=first-parent",
          commit,
          "--",
          "docs/project/archive/",
        ],
        signal,
      )
    )
      .toString()
      .split("\0");
    let introduction = "";
    for (const item of history) {
      const value = item.trim();
      if (/^[a-f0-9]{40,64}$/.test(value)) {
        introduction = value;
        continue;
      }
      const match =
        /^docs\/project\/archive\/[^/]{10}-([a-z0-9]+(?:-[a-z0-9]+)*)\/change\.json$/.exec(
          value,
        );
      if (match && introduction && pending.delete(match[1]))
        result[match[1]].introduction = introduction;
      if (!pending.size) break;
    }
  } catch {
    signal.throwIfAborted();
  }
  for (const id of pending)
    result[id].message = "已核实发布归档，首次合入历史暂不可核实。";
  return result;
}
