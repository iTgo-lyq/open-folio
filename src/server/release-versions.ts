import { readBlobs } from "./git-objects.ts";
import "server-only";
import { parse as toml } from "smol-toml";
import { parseDocument } from "yaml";
import { SaxesParser } from "saxes";
import type { GitReader } from "./git.ts";
import type {
  Limits,
  ReleaseVersion,
  ReleaseVersionCache,
} from "../lib/model.ts";

const paths = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "pom.xml",
  "pubspec.yaml",
  "VERSION",
  "version.txt",
];
export const RELEASE_TAG_TTL_MS = 5 * 60_000;
const missing: ReleaseVersion = { status: "missing" };
const version = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.trim().length <= 128 &&
  /^[vV]?\d[0-9A-Za-z.!+_-]*$/.test(value.trim())
    ? value.trim().replace(/^[vV](?=\d)/, "")
    : undefined;
const at = (value: unknown, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
};

/** Only static project fields; never execute build files or inspect dependency versions. */
export function versionFromFile(
  path: string,
  body: string,
): string | undefined {
  try {
    if (path === "VERSION" || path === "version.txt") return version(body);
    if (path === "package.json")
      return version(at(JSON.parse(body), "version"));
    if (path === "Cargo.toml") {
      const data = toml(body);
      const packageVersion = at(data, "package", "version");
      return version(
        at(data, "package") === undefined ||
          at(packageVersion, "workspace") === true
          ? at(data, "workspace", "package", "version")
          : packageVersion,
      );
    }
    if (path === "pyproject.toml") {
      const data = toml(body);
      const dynamic = at(data, "project", "dynamic");
      if (Array.isArray(dynamic) && dynamic.includes("version"))
        return undefined;
      return version(
        at(data, "project", "version") ?? at(data, "tool", "poetry", "version"),
      );
    }
    if (path === "pubspec.yaml") {
      const doc = parseDocument(body);
      if (doc.errors.length) return undefined;
      return version(at(doc.toJS({ maxAliasCount: 0 }), "version"));
    }
    if (path === "pom.xml") {
      const parser = new SaxesParser({ xmlns: true });
      const stack: string[] = [];
      const values: string[] = [];
      let text = "";
      const reject = () => {
        throw Error("Unsupported POM");
      };
      parser.on("doctype", reject);
      parser.on("processinginstruction", reject);
      parser.on("opentag", (tag) => {
        if (tag.uri && tag.uri !== "http://maven.apache.org/POM/4.0.0")
          reject();
        stack.push(tag.local);
        if (stack.length > 64 || (stack.length > 2 && stack[1] === "version"))
          reject();
        if (stack.join("/") === "project/version") text = "";
      });
      const append = (part: string) => {
        if (stack.join("/") === "project/version") text += part;
      };
      parser.on("text", append);
      parser.on("cdata", append);
      parser.on("closetag", () => {
        if (stack.join("/") === "project/version") values.push(text);
        stack.pop();
      });
      parser.write(body).close();
      return values.length === 1 ? version(values[0]) : undefined;
    }
  } catch {
    /* Invalid or dynamic manifests have no static version. */
  }
  return undefined;
}

function unique(versions: string[]): ReleaseVersion {
  const distinct = [...new Set(versions)];
  return distinct.length === 1
    ? { status: "found", version: distinct[0] }
    : distinct.length > 1
      ? { status: "ambiguous" }
      : missing;
}

/** Remote advertisements include peeled annotated tags, without fetching tag objects. */
export function versionsFromTags(
  body: string,
  commits: string[],
): Record<string, ReleaseVersion> {
  const refs = new Map<string, string>();
  for (const line of body.split("\n")) {
    const match = /^([a-f0-9]{40}|[a-f0-9]{64})\s+(refs\/tags\/\S+)$/.exec(
      line,
    );
    if (match) refs.set(match[2], match[1]);
  }
  const wanted = new Set(commits);
  const values = new Map<string, string[]>();
  for (const [ref, oid] of refs) {
    if (ref.endsWith("^{}")) continue;
    const name = ref.slice("refs/tags/".length).replace(/^release[-/]/, "");
    // A package prefix or an arbitrary number in a name is not a project version.
    if (
      !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(name)
    )
      continue;
    const commit = refs.get(`${ref}^{}`) ?? oid;
    if (!wanted.has(commit)) continue;
    const list = values.get(commit) ?? [];
    list.push(name.replace(/^v/, ""));
    values.set(commit, list);
  }
  return Object.fromEntries(
    commits.map((commit) => [commit, unique(values.get(commit) ?? [])]),
  );
}

export async function collectReleaseVersions(
  reader: Pick<GitReader, "run">,
  commits: string[],
  limits: Limits,
  signal: AbortSignal,
  previous?: ReleaseVersionCache,
  now = Date.now(),
): Promise<{
  cache: ReleaseVersionCache;
  versions: Record<string, ReleaseVersion>;
}> {
  const files: Record<string, ReleaseVersion> = {};
  const versions: Record<string, ReleaseVersion> = {};
  const needed = new Map<string, number>();
  const pending = new Map<string, { path: string; blob: string }[]>();
  let bytes = 0;
  for (const commit of [...new Set(commits)].sort()) {
    signal.throwIfAborted();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) continue;
    if (
      previous?.files[commit] &&
      previous.files[commit].status !== "unavailable"
    ) {
      files[commit] = previous.files[commit];
      continue;
    }
    try {
      const rows = (
        await reader.run(
          ["ls-tree", "-lz", "--full-tree", commit, "--", ...paths],
          signal,
        )
      )
        .toString()
        .split("\0");
      const entries: { path: string; blob: string }[] = [];
      let unreadable = false;
      for (const row of rows) {
        const match =
          /^(\d{6}) (blob|tree|commit) ([a-f0-9]+)\s+(\d+|-)\t(.+)$/.exec(row);
        if (!match || !paths.includes(match[5])) continue;
        const [, mode, kind, blob, sizeText, path] = match,
          size = Number(sizeText);
        if (
          kind !== "blob" ||
          !["100644", "100755"].includes(mode) ||
          !Number.isSafeInteger(size) ||
          size > Math.min(limits.jsonBytes, 256 * 1024)
        ) {
          unreadable = true;
          continue;
        }
        if (!needed.has(blob)) {
          if (bytes + size > limits.totalBytes)
            throw Error("Version read limit");
          bytes += size;
          needed.set(blob, size);
        }
        entries.push({ path, blob });
      }
      if (unreadable) files[commit] = { status: "unreadable" };
      else pending.set(commit, entries);
    } catch {
      signal.throwIfAborted();
      files[commit] = { status: "unavailable" };
    }
  }
  try {
    const blobs = await readBlobs(reader, needed, signal);
    const text = new Map<string, string>();
    for (const [blob, body] of blobs) {
      try {
        text.set(blob, new TextDecoder("utf-8", { fatal: true }).decode(body));
      } catch {
        text.set(blob, "");
      }
    }
    for (const [commit, entries] of pending)
      files[commit] = unique(
        entries.flatMap(({ path, blob }) => {
          const value = versionFromFile(path, text.get(blob)!);
          return value ? [value] : [];
        }),
      );
  } catch {
    signal.throwIfAborted();
    for (const commit of pending.keys())
      files[commit] = { status: "unavailable" };
  }
  const needsTags = Object.keys(files).filter(
    (commit) => files[commit].status === "missing",
  );
  let tags: ReleaseVersionCache["tags"];
  if (needsTags.length) {
    const prior = previous?.tags;
    if (
      prior &&
      now >= prior.checkedAt &&
      now - prior.checkedAt < RELEASE_TAG_TTL_MS &&
      JSON.stringify(prior.commits) === JSON.stringify(needsTags)
    )
      tags = prior;
    else {
      try {
        const body = (
          await reader.run(
            [
              "ls-remote",
              "--tags",
              "origin",
              "refs/tags/v*",
              "refs/tags/[0-9]*",
              "refs/tags/release-*",
              "refs/tags/release/*",
            ],
            signal,
            Math.min(limits.totalBytes, 4 * 1024 * 1024),
          )
        ).toString();
        tags = {
          checkedAt: now,
          commits: needsTags,
          versions: versionsFromTags(body, needsTags),
        };
      } catch {
        signal.throwIfAborted();
      }
    }
  }
  for (const [commit, result] of Object.entries(files))
    versions[commit] =
      result.status === "missing"
        ? (tags?.versions[commit] ?? { status: "unavailable" })
        : result;
  return { cache: { files, ...(tags ? { tags } : {}) }, versions };
}
