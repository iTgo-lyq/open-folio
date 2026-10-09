import type { Collected } from "./indexer.ts";
import type { GitReader } from "./git.ts";
import type {
  Limits,
  ProjectConfig,
  Snapshot,
  PreviewDescriptor,
  PreviewEntry,
} from "../lib/model.ts";
import { primaryRecord } from "../lib/model.ts";
import {
  changeSchema,
  workflowSchema,
  identity,
  previewsSchema,
} from "./schema.ts";
import { entryPath } from "../../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import { htmlIssues } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";
import { AppError } from "./errors.ts";
export function prototypePolicy(
  data: Collected,
  project: ProjectConfig,
): Snapshot["prototype"] {
  const branch = project.specBranch ?? data.defaultBranch;
  const doc = data.documents.find(
    (d) => d.branch === branch && d.path === "docs/project/workflow.json",
  );
  const base = { branch, commit: doc?.commit };
  try {
    if (!doc?.readable) throw Error();
    const workflow = workflowSchema.parse(
      JSON.parse(data.blobs.get(doc.blob)!.toString()),
    );
    const status = workflow.prototype?.status ?? "unconfigured";
    return {
      ...base,
      status,
      message: {
        enabled: "原型追踪已启用",
        disabled: "项目已停用原型追踪；保留历史关联，暂不提供预览。",
        pending: "项目原型包尚未完成初始化。",
        unconfigured: "项目尚未接入原型追踪。",
      }[status],
    };
  } catch {
    return {
      ...base,
      status: "invalid",
      message: "配置基线缺少有效的 workflow.json 原型配置，请修复并重新读取。",
    };
  }
}
const revisionPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
type TreeEntry = {
  mode: string;
  kind: string;
  blob: string;
  bytes: number;
  path: string;
};
async function tree(
  reader: GitReader,
  revision: string,
  path: string,
  signal: AbortSignal,
): Promise<TreeEntry[]> {
  const raw = (
    await reader.run(
      ["ls-tree", "-rlz", "--full-tree", revision, "--", path],
      signal,
    )
  ).toString();
  return raw
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf("\t"),
        [mode, kind, blob, size] = row.slice(0, tab).trim().split(/\s+/);
      return {
        mode,
        kind,
        blob,
        bytes: Number(size),
        path: row.slice(tab + 1),
      };
    });
}
async function body(
  reader: GitReader,
  file: TreeEntry | undefined,
  limit: number,
  signal: AbortSignal,
) {
  if (
    !file ||
    file.kind !== "blob" ||
    !["100644", "100755"].includes(file.mode)
  )
    throw new AppError(
      "PREVIEW_FILE_MISSING",
      "入口缺失或不是常规 Git 文件。",
      404,
    );
  if (!Number.isSafeInteger(file.bytes) || file.bytes > limit)
    throw new AppError("PREVIEW_SIZE", "原型文件超过当前服务大小限制。", 413);
  const buffer = await reader.run(
    ["cat-file", "blob", file.blob],
    signal,
    limit + 1024,
  );
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError("PREVIEW_ENCODING", "原型必须是 UTF-8 HTML。", 400);
  }
  if (text.startsWith("version https://git-lfs.github.com/spec/"))
    throw new AppError(
      "PREVIEW_LFS",
      "原型内容是 Git LFS 指针，请提交实际静态 HTML。",
      400,
    );
  return text;
}
export async function resolvePreview(
  reader: GitReader,
  latest: Snapshot,
  source: Snapshot,
  changeId: string,
  requestedRevision: string | undefined,
  limits: Limits,
  selectedId?: string,
  selectedOnly = false,
  project?: ProjectConfig,
) {
  if (
    !identity.safeParse(changeId).success ||
    (selectedId && !identity.safeParse(selectedId).success) ||
    (requestedRevision && !revisionPattern.test(requestedRevision))
  )
    throw new AppError("INVALID_PARAMETER", "原型入口或版本参数不合法。", 400);
  const descriptor: PreviewDescriptor = {
    changeId,
    revision: null,
    pinned: false,
    policy: latest.prototype,
    entries: [],
  };
  const fail = (message: string) => ({
    descriptor: { ...descriptor, message },
    html: undefined,
  });
  if (latest.prototype.status !== "enabled")
    return fail(latest.prototype.message);
  const group = source.changes.find((g) => g.id === changeId),
    candidate = group && primaryRecord(group);
  let revision = requestedRevision ?? candidate?.commit;
  if (
    !requestedRevision &&
    candidate?.archived &&
    candidate.state &&
    !candidate.state.previews?.length &&
    !candidate.diagnostics.some((d) => d.code === "PREVIEWS_INVALID")
  )
    return fail("这个 Change 还没有关联原型。");
  if (!requestedRevision && candidate?.archived) {
    const ref = latest.archiveRefs.find((r) => r.id === changeId);
    if (!ref)
      return fail("归档预览缺少保留标签 spec-trail/archive/" + changeId + "。");
    if (latest.archivePins[changeId] !== ref.commit)
      return fail("归档标签被改写，已停止预览；请恢复原交付引用。");
    revision = ref.commit;
    descriptor.pinned = true;
  }
  if (!revision)
    return fail("未找到可判定的 Change 主来源，请先核对已推送分支。");
  descriptor.revision = revision;
  const signal = AbortSignal.timeout(limits.refreshMs);
  const tips = [
    ...latest.branches.map((b) => b.commit),
    ...latest.archiveRefs
      .filter((r) => latest.archivePins[r.id] === r.commit)
      .map((r) => r.commit),
  ];
  try {
    if (
      (await reader.run(["cat-file", "-t", revision], signal))
        .toString()
        .trim() !== "commit" ||
      !tips.length ||
      (
        await reader.run(
          ["rev-list", "--max-count=1", revision, "--not", ...tips, "--"],
          signal,
        )
      ).length
    )
      return fail("该版本不在当前项目允许的已推送引用中，无法回看。");
  } catch {
    return fail("该 Git 版本已不可用，请检查原分支或归档保留引用。");
  }
  const documents = await tree(reader, revision, "docs/project/", signal);
  const stateFiles = documents.filter(
    (f) =>
      f.path === `docs/project/changes/${changeId}/change.json` ||
      new RegExp(
        `^docs/project/archive/[0-9]{4}-[0-9]{2}-[0-9]{2}-${changeId}/change.json$`,
      ).test(f.path),
  );
  if (stateFiles.length !== 1)
    return fail("指定版本中缺少唯一的 Change 记录。");
  let raw: Record<string, unknown>;
  let configuration;
  try {
    raw = JSON.parse(
      await body(reader, stateFiles[0], limits.jsonBytes, signal),
    );
    const { previews: ignored, ...core } = raw;
    const state = changeSchema.parse(core);
    if (state.id !== changeId) throw Error();
    if (
      raw.previews === undefined ||
      (Array.isArray(raw.previews) && !raw.previews.length)
    )
      return fail("这个 Change 还没有关联原型。");
    if (stateFiles[0].path.startsWith("docs/project/archive/")) {
      const ref = latest.archiveRefs.find((r) => r.id === changeId);
      if (
        !ref ||
        ref.commit !== revision ||
        latest.archivePins[changeId] !== revision
      )
        return fail("该归档版本没有一致的保留标签，不能替换为其他版本。");
      if (
        state.status !== "completed" ||
        state.stage !== "close" ||
        state.closure.verification?.result !== "passed" ||
        state.closure.acceptance?.result !== "accepted" ||
        !["synced", "not_needed"].includes(state.closure.specs?.result ?? "") ||
        state.closure.archive?.result !== "done" ||
        state.closure.archive.path !== stateFiles[0].path.slice(0, -12)
      )
        return fail("保留标签中的归档状态或目录不一致。");
      descriptor.pinned = true;
    }
    configuration = workflowSchema.parse(
      JSON.parse(
        await body(
          reader,
          documents.find((f) => f.path === "docs/project/workflow.json"),
          limits.jsonBytes,
          signal,
        ),
      ),
    ).prototype;
    if (configuration?.status !== "enabled")
      return fail("该提交中的原型包未启用；当前开关不会改写历史配置。");
  } catch {
    return fail("指定版本中的 Change 或项目原型配置不合法。");
  }
  if (
    raw.previews === undefined ||
    (Array.isArray(raw.previews) && !raw.previews.length)
  )
    return fail("这个 Change 还没有关联原型。");
  if (!Array.isArray(raw.previews))
    return fail("previews 必须是页面或组件关联数组。");
  const changeDirectory = stateFiles[0].path.slice(0, -12);
  const files = [
    ...(await tree(
      reader,
      revision,
      `${configuration.packagePath}/preview/`,
      signal,
    )),
    ...documents.filter((f) =>
      f.path.startsWith(`${changeDirectory}/previews/`),
    ),
  ];
  const htmlFiles = files.filter(
    (f) =>
      f.path.endsWith("/index.html") &&
      f.kind === "blob" &&
      ["100644", "100755"].includes(f.mode),
  );
  const unique = new Map(htmlFiles.map((f) => [f.blob, f.bytes]));
  if (
    raw.previews.length > limits.previewEntries ||
    htmlFiles.length > limits.previewEntries ||
    [...unique.values()].some((n) => !Number.isSafeInteger(n)) ||
    [...unique.values()].reduce((a, b) => a + b, 0) > limits.previewTotalBytes
  )
    return fail("原型包的入口数量或静态 HTML 总量超过服务限制。");
  let selectedHtml: string | undefined;
  for (const [index, value] of raw.previews.entries()) {
    // Thumbnail requests need one body, while the descriptor API validates all
    // entries. Keep the package-wide tree limits above for both read paths.
    if (selectedOnly && value?.id !== selectedId) continue;
    const parsed = previewsSchema.safeParse([value]);
    const duplicate =
      value?.id && raw.previews.filter((p) => p?.id === value.id).length > 1;
    if (!parsed.success || duplicate) {
      descriptor.entries.push({
        id: `invalid-${index}`,
        title:
          typeof value?.title === "string"
            ? value.title
            : `无效入口 ${index + 1}`,
        path: "",
        kind: "component",
        available: false,
        message: "关联字段不合法或 id 重复，请检查 change.json。",
      });
      continue;
    }
    const entry = parsed.data[0] as PreviewEntry;
    const info: PreviewDescriptor["entries"][number] = {
      ...entry,
      available: false,
    };
    descriptor.entries.push(info);
    if (entry.artifact?.type === "hosted") {
      const artifact = entry.artifact;
      if (!project?.prototypeOrigins?.includes(new URL(artifact.url).origin)) {
        info.message =
          "托管地址来源未获允许，请联系服务管理员配置 prototypeOrigins。";
        continue;
      }
      info.available = true;
      info.url = artifact.url;
      info.thumbnails = artifact.thumbnails?.filter((t) =>
        project.prototypeOrigins?.includes(new URL(t.url).origin),
      );
      try {
        info.sourceAvailable =
          (await reader.run(["cat-file", "-t", artifact.sourceCommit], signal))
            .toString()
            .trim() === "commit";
      } catch {
        info.sourceAvailable = false;
      }
      continue;
    }
    const path = entryPath(entry, configuration, changeDirectory),
      file = files.find((f) => f.path === path);
    if (!path) {
      info.message = "入口路径不属于该提交配置的 prototype/preview 目录。";
      continue;
    }
    try {
      const html = await body(reader, file, limits.previewBytes, signal),
        issues = htmlIssues(html);
      if (issues.length) {
        info.message = `导出物尚未自包含：${issues.join("；")}`;
        continue;
      }
      info.available = true;
      info.bytes = file!.bytes;
      info.url = `/preview/${encodeURIComponent(latest.projectId)}/${revision}/${changeId}/${entry.id}/index.html`;
      if (entry.id === selectedId) selectedHtml = html;
    } catch (e) {
      info.message =
        e instanceof AppError
          ? e.message
          : "原型内容读取失败，请重新读取中心仓库。";
    }
  }
  return { descriptor, html: selectedHtml };
}
