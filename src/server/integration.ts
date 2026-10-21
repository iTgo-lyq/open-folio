import { devNull } from "node:os";
import type { Snapshot, IntegrationRecord } from "../lib/model.ts";
import type {
  IntegrationFile,
  IntegrationSummary,
  IntegrationFiles,
  IntegrationDiff,
  DiffLine,
} from "../lib/integration.ts";
import {
  integrationFor,
  validChangeId,
} from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { GitReader, hash } from "./git.ts";
import { AppError } from "./errors.ts";

const pageSize = 100,
  byteLimit = 1024 * 1024,
  lineLimit = 10000;
const diffOptions = [
  "--no-ext-diff",
  "--no-textconv",
  "--no-color",
  "--find-renames=50%",
  "-l1000",
];
type Entry = { file: IntegrationFile; before: string; after: string };
const invalid = () =>
  new AppError("INVALID_PARAMETER", "差异读取参数不属于当前快照。", 400);
function displayPath(buffer: Buffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return [...buffer]
      .map((byte) => `\\x${byte.toString(16).padStart(2, "0")}`)
      .join("");
  }
  return text.replace(
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
function fields(buffer: Buffer) {
  if (buffer.length && buffer.at(-1) !== 0)
    throw Error("Incomplete diff metadata");
  const result: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++)
    if (buffer[i] === 0) {
      result.push(buffer.subarray(start, i));
      start = i + 1;
    }
  return result;
}
const key = (oldPath: Buffer, path: Buffer) =>
  `${oldPath.toString("hex")}:${path.toString("hex")}`;

export class IntegrationReader {
  private reader: GitReader;
  private snapshot: Snapshot;
  private id: string;
  constructor(reader: GitReader, snapshot: Snapshot, id: string) {
    this.reader = reader;
    this.snapshot = snapshot;
    this.id = id;
    if (!validChangeId(id)) throw invalid();
    if (!snapshot.changes.some((change) => change.id === id))
      throw new AppError(
        "CHANGE_NOT_FOUND",
        "Change 不在当前项目版本中。",
        404,
      );
  }
  private record() {
    return integrationFor(this.snapshot.integrations, this.id);
  }
  private found(): IntegrationRecord {
    const record = this.record();
    if (record.status !== "found")
      throw new AppError("INTEGRATION_UNAVAILABLE", record.message, 409);
    return record;
  }
  private async entries(record: IntegrationRecord): Promise<Entry[]> {
    // Both formats use NUL fields and exactly the same rename strategy.
    const raw = fields(
      await this.reader.run([
        "diff",
        ...diffOptions,
        "--raw",
        "--no-abbrev",
        "-z",
        record.base,
        record.commit,
        "--",
      ]),
    );
    const nums = fields(
      await this.reader.run([
        "diff",
        ...diffOptions,
        "--numstat",
        "-z",
        record.base,
        record.commit,
        "--",
      ]),
    );
    const stats = new Map<
      string,
      { added: number | null; removed: number | null }
    >();
    for (let i = 0; i < nums.length; ) {
      const row = nums[i++],
        tab = row.indexOf(9),
        next = row.indexOf(9, tab + 1);
      if (tab < 0 || next < 0) throw Error("Invalid numstat");
      const values = [
        row.subarray(0, tab).toString(),
        row.subarray(tab + 1, next).toString(),
      ];
      if (!values.every((value) => value === "-" || /^\d+$/.test(value)))
        throw Error("Invalid statistics");
      let path = row.subarray(next + 1),
        oldPath = path;
      if (!path.length) {
        oldPath = nums[i++];
        path = nums[i++];
      }
      if (!oldPath || !path) throw Error("Incomplete rename");
      stats.set(key(oldPath, path), {
        added: values[0] === "-" ? null : Number(values[0]),
        removed: values[1] === "-" ? null : Number(values[1]),
      });
    }
    const entries: Entry[] = [];
    for (let i = 0; i < raw.length; ) {
      const meta =
        /^:(\d{6}) (\d{6}) ([a-f0-9]{40,64}) ([a-f0-9]{40,64}) ([A-Z])\d*$/.exec(
          raw[i++].toString(),
        );
      if (!meta) throw Error("Invalid raw diff");
      const [, oldMode, newMode, before, after, status] = meta;
      const first = raw[i++],
        path = ["R", "C"].includes(status) ? raw[i++] : first;
      if (!first || !path) throw Error("Missing path");
      const numbers = stats.get(key(first, path));
      if (!numbers) throw Error("File statistics disagree");
      stats.delete(key(first, path));
      const kind = [oldMode, newMode].includes("160000")
        ? "submodule"
        : [oldMode, newMode].includes("120000")
          ? "symlink"
          : before === after && oldMode !== newMode
            ? "mode-only"
            : numbers.added === null
              ? "binary"
              : "text";
      entries.push({
        before,
        after,
        file: {
          id: hash(`${record.base}\0${record.commit}\0${key(first, path)}`),
          path: displayPath(path),
          ...(path.equals(first) ? {} : { oldPath: displayPath(first) }),
          status,
          kind,
          oldMode,
          newMode,
          ...numbers,
        },
      });
    }
    if (stats.size) throw Error("Incomplete file list");
    return entries;
  }
  async summary(): Promise<IntegrationSummary> {
    const record = this.record();
    const summary: IntegrationSummary = {
      record,
      integrationBranch: this.snapshot.integrationBranch,
    };
    if (record.status !== "found") return summary;
    const entries = await this.entries(record);
    return {
      ...summary,
      command: `git diff --no-ext-diff --no-textconv ${record.commit}^1 ${record.commit}`,
      stats: {
        total: entries.length,
        added: entries.reduce((n, e) => n + (e.file.added ?? 0), 0),
        removed: entries.reduce((n, e) => n + (e.file.removed ?? 0), 0),
        unstatable: entries.filter(
          (e) => e.file.added === null || e.file.removed === null,
        ).length,
        complete: true,
      },
    };
  }
  async files(cursor?: string): Promise<IntegrationFiles> {
    const record = this.found(),
      entries = await this.entries(record);
    const signature = hash(
      `${this.snapshot.id}\0${record.base}\0${record.commit}`,
    );
    let start = 0;
    if (cursor) {
      const match = /^(\d+)\.([a-f0-9]{64})$/.exec(cursor);
      if (!match || match[2] !== signature) throw invalid();
      start = Number(match[1]);
      if (
        !Number.isSafeInteger(start) ||
        start <= 0 ||
        start % pageSize ||
        start >= entries.length
      )
        throw invalid();
    }
    return {
      files: entries.slice(start, start + pageSize).map((entry) => entry.file),
      total: entries.length,
      next:
        start + pageSize < entries.length
          ? `${start + pageSize}.${signature}`
          : null,
    };
  }
  async file(fileId: string): Promise<IntegrationDiff> {
    if (!/^[a-f0-9]{64}$/.test(fileId)) throw invalid();
    const record = this.found(),
      entry = (await this.entries(record)).find(
        (entry) => entry.file.id === fileId,
      );
    if (!entry)
      throw new AppError(
        "DIFF_FILE_NOT_FOUND",
        "文件不在本次合入变更中。",
        404,
      );
    const { file, before, after } = entry;
    const result = (
      kind: IntegrationDiff["kind"],
      message: string,
    ): IntegrationDiff => ({ file, kind, message, lines: [] });
    if (file.kind !== "text")
      return result(
        file.kind,
        {
          binary: "二进制文件，无法展示文本差异。",
          submodule: "子模块引用发生变化；不读取外部仓库。",
          symlink: "符号链接发生变化；不跟随链接读取内容。",
          "mode-only": `文件模式由 ${file.oldMode} 变为 ${file.newMode}，内容未变。`,
        }[file.kind],
      );
    for (const oid of new Set(
      [before, after].filter((oid) => !/^0+$/.test(oid)),
    )) {
      const size = Number(
        (await this.reader.run(["cat-file", "-s", oid])).toString(),
      );
      if (!Number.isSafeInteger(size)) throw Error("Invalid object size");
      if (size > byteLimit)
        return result(
          "limited",
          "源文件超过 1 MiB 读取上限，未展示完整差异。可复制 Git 比较命令在本地查看。",
        );
      const body = await this.reader.run(
        ["cat-file", "blob", oid],
        undefined,
        byteLimit + 1,
      );
      if (body.includes(0))
        return result("binary", "二进制文件，无法展示文本差异。");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      } catch {
        return result("non-utf8", "文件不是 UTF-8 文本，无法展示文本差异。");
      }
      if (/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\n/.test(text))
        return result("lfs", "这是 Git LFS 指针；不下载外部文件内容。");
    }
    // Compare the validated blobs, so raw/non-UTF-8 filenames never become shell or pathspec input.
    const empty =
      /^0+$/.test(before) || /^0+$/.test(after)
        ? (await this.reader.run(["hash-object", "-w", "--", devNull]))
            .toString()
            .trim()
        : "";
    let patch: Buffer;
    try {
      patch = await this.reader.run(
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          "--text",
          "--unified=3",
          /^0+$/.test(before) ? empty : before,
          /^0+$/.test(after) ? empty : after,
          "--",
        ],
        undefined,
        byteLimit + 1,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "GIT_OUTPUT_LIMIT")
        return result("limited", "差异超过 1 MiB 展示上限，未完整展示。");
      throw error;
    }
    if (patch.length > byteLimit)
      return result("limited", "差异超过 1 MiB 展示上限，未完整展示。");
    const lines: DiffLine[] = [];
    let oldLine = 0,
      newLine = 0,
      inHunk = false;
    for (const text of patch.toString("utf8").split("\n")) {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        inHunk = true;
        lines.push({ kind: "hunk", text });
      } else if (inHunk && text.startsWith("+"))
        lines.push({ kind: "add", text: text.slice(1), new: newLine++ });
      else if (inHunk && text.startsWith("-"))
        lines.push({ kind: "remove", text: text.slice(1), old: oldLine++ });
      else if (inHunk && text.startsWith(" "))
        lines.push({
          kind: "context",
          text: text.slice(1),
          old: oldLine++,
          new: newLine++,
        });
      else if (inHunk && text.startsWith("\\"))
        lines.push({ kind: "note", text });
      if (lines.length > lineLimit)
        return result("limited", "差异超过 10000 行展示上限，未完整展示。");
    }
    return lines.length
      ? { file, kind: "text", lines }
      : result(
          "empty",
          file.oldPath ? "文件已移动，内容未变。" : "没有文本内容变化。",
        );
  }
}
