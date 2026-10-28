import type { Collected } from "./indexer.ts";
import type { GitReader } from "./git.ts";
import type {
  Limits,
  Snapshot,
  PreviewDescriptor,
  PreviewEntry,
  PrototypeConfig,
} from "../lib/model.ts";
import { primaryRecord } from "../lib/model.ts";
import {
  changeSchema,
  workflowSchema,
  identity,
  previewsSchema,
} from "./schema.ts";
import { integrationFor } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import { closedRecord } from "../../.agents/skills/spec-trail/scripts/routing.mjs";
import { entryPath } from "../../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import { htmlIssues } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";
import { AppError } from "./errors.ts";
import { resolvePackage } from "./prototype-source.ts";
import {
  inPackage,
  withinPackage,
  treeRows,
  sameRepository,
} from "../../.agents/skills/spec-trail/prototype/scripts/source.mjs";
import { validateManifest } from "../../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
export function prototypePolicy(data: Collected): Snapshot["prototype"] {
  const branch = data.integrationBranch;
  const doc = data.documents.find(
    (d) => d.branch === branch && d.path === "docs/project/workflow.json",
  );
  const base = { branch, commit: doc?.commit };
  try {
    if (!doc?.readable) throw Error();
    const workflow = workflowSchema.parse(
      JSON.parse(data.blobs.get(doc.blob)!.toString()),
    );
    if (
      !branch ||
      workflow.integrationBranch !== branch ||
      data.sourceDiagnostics.some((d) => d.code !== "INTEGRATION_INVALID")
    )
      throw Error();
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
  reader?: GitReader;
  mode: string;
  kind: string;
  blob: string;
  bytes: number;
  path: string;
};
export async function tree(
  reader: GitReader,
  revision: string,
  path: string,
  signal: AbortSignal,
): Promise<TreeEntry[]> {
  let raw = (
    await reader.run(
      ["ls-tree", "-rlz", "--full-tree", revision, "--", path],
      signal,
    )
  ).toString();
  let owner = reader,
    mount = "";
  if (!raw || /160000 commit /.test(raw)) {
    const resolved = await resolvePackage(
      reader,
      revision,
      path.replace(/\/$/, ""),
      signal,
    );
    if (resolved.mount) {
      owner = resolved.reader;
      mount = resolved.mount;
      raw = (
        await owner.run(
          [
            "ls-tree",
            "-rlz",
            "--full-tree",
            resolved.revision,
            ...(resolved.packagePath ? ["--", resolved.packagePath] : []),
          ],
          signal,
        )
      ).toString();
    }
  }
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
        path: mount ? `${mount}/${row.slice(tab + 1)}` : row.slice(tab + 1),
        ...(owner !== reader ? { reader: owner } : {}),
      };
    });
}
export async function body(
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
  const buffer = await (file.reader ?? reader).run(
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
export async function readPrototypeConfiguration(
  reader: GitReader,
  main: string | undefined,
  limits: Limits,
  signal: AbortSignal,
): Promise<PrototypeConfig> {
  let configuration;
  try {
    if (!main) throw Error();
    const path = "docs/project/workflow.json";
    const files = await tree(reader, main, path, signal);
    configuration = workflowSchema.parse(
      JSON.parse(
        await body(
          reader,
          files.find((f) => f.path === path),
          limits.jsonBytes,
          signal,
        ),
      ),
    ).prototype;
  } catch {
    signal.throwIfAborted();
    throw new AppError(
      "PROTOTYPE_CONFIG_INVALID",
      "默认分支当前 workflow.json 原型配置无效或不可读。",
      400,
    );
  }
  if (configuration?.status !== "enabled")
    throw new AppError("PROTOTYPE_DISABLED", "默认分支尚未启用原型协作。", 400);
  return configuration;
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
  const fail = (message: string, failed = true) => ({
    descriptor: { ...descriptor, message, failed },
    html: undefined,
  });
  if (latest.prototype.status !== "enabled")
    return fail(
      latest.prototype.message,
      latest.prototype.status === "invalid",
    );
  const group = source.changes.find((g) => g.id === changeId),
    candidate = group && primaryRecord(group);
  let revision = requestedRevision ?? candidate?.commit;
  if (
    candidate?.archived &&
    candidate.state &&
    !candidate.state.previews?.length &&
    !candidate.diagnostics.some((d) => d.code === "PREVIEWS_INVALID")
  )
    return fail("这个 Change 还没有关联原型。", false);
  const route = latest.routes.find((route) => route.id === changeId);
  if (!route || route.errors.length)
    return fail("未找到可判定的 Change 主来源，请先核对已推送分支。");
  const central = route.kind === "archive";
  const integration = central
    ? integrationFor(latest.integrations, changeId)
    : undefined;
  if (central) {
    if (integration?.status !== "found")
      return fail(
        integration?.status === "missing"
          ? "未记录可定位的交付版本。"
          : (integration?.message ?? "合入记录暂不可读。"),
        integration?.status !== "missing",
      );
    if (requestedRevision && requestedRevision !== integration.commit)
      return fail(
        "已合入 Change 的预览须使用固定合并提交，不能替换为其他版本。",
      );
    revision = integration.commit;
    descriptor.pinned = true;
  }
  if (!revision)
    return fail("未找到可判定的 Change 主来源，请先核对已推送分支。");
  descriptor.revision = revision;
  const signal = AbortSignal.timeout(limits.refreshMs);
  const tips = latest.branches
    .filter((branch) => branch.name === route.branch)
    .map((branch) => branch.commit);
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
    return fail("该 Git 版本已不可用，请重新获取对应交付历史。");
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
      return fail("这个 Change 还没有关联原型。", false);
    if (stateFiles[0].path.startsWith("docs/project/archive/")) {
      if (
        central &&
        (integration?.status !== "found" ||
          stateFiles[0].path !== `${integration.archivePath}/change.json`)
      )
        return fail("合并提交中的归档路径不一致。");
      if (!closedRecord(state, stateFiles[0].path.slice(0, -12)))
        return fail("交付归档的关闭状态或目录不一致。");
      descriptor.pinned = true;
    }
  } catch {
    return fail("指定版本中的 Change 记录不合法或不可读。");
  }
  if (
    raw.previews === undefined ||
    (Array.isArray(raw.previews) && !raw.previews.length)
  )
    return fail("这个 Change 还没有关联原型。", false);
  if (!Array.isArray(raw.previews))
    return fail("previews 必须是页面或组件关联数组。");
  let configuration;
  try {
    configuration = await readPrototypeConfiguration(
      reader,
      latest.branches.find((b) => b.name === latest.integrationBranch)?.commit,
      limits,
      signal,
    );
  } catch (e) {
    signal.throwIfAborted();
    return fail(
      e instanceof AppError ? e.message : "默认分支当前原型配置读取失败。",
    );
  }
  return resolveEntries(
    reader,
    descriptor,
    revision,
    configuration,
    raw.previews,
    limits,
    selectedId,
    selectedOnly,
    stateFiles[0].path.slice(0, -12),
  );
}
export async function resolveEntries(
  reader: GitReader,
  descriptor: PreviewDescriptor,
  revision: string,
  configuration: PrototypeConfig,
  rawEntries: unknown[],
  limits: Limits,
  selectedId?: string,
  selectedOnly = false,
  changeDirectory?: string,
) {
  const signal = AbortSignal.timeout(limits.refreshMs);
  const fail = (message: string) => ({
    descriptor: { ...descriptor, message, failed: true },
    html: undefined,
  });
  const needsPackage = rawEntries.some(
    (entry: any) =>
      entry?.artifact?.type === "git" &&
      !(
        changeDirectory &&
        entry.artifact.path?.startsWith(`${changeDirectory}/previews/`)
      ),
  );
  let packageFiles: TreeEntry[] = [],
    packageError: string | undefined;
  if (needsPackage)
    try {
      packageFiles = await tree(
        reader,
        revision,
        `${configuration.packagePath}/preview/`,
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      packageError =
        error instanceof AppError ? error.message : "子模块原型产物不可读。";
    }
  const files = [
    ...packageFiles,
    ...(changeDirectory
      ? await tree(reader, revision, `${changeDirectory}/previews/`, signal)
      : []),
  ];
  const htmlFiles = files.filter(
    (f) =>
      f.path.endsWith("/index.html") &&
      f.kind === "blob" &&
      ["100644", "100755"].includes(f.mode),
  );
  const unique = new Map(htmlFiles.map((f) => [f.blob, f.bytes]));
  if (
    rawEntries.length > limits.previewEntries ||
    htmlFiles.length > limits.previewEntries ||
    [...unique.values()].some((n) => !Number.isSafeInteger(n)) ||
    [...unique.values()].reduce((a, b) => a + b, 0) > limits.previewTotalBytes
  )
    return fail("原型包的入口数量或静态 HTML 总量超过服务限制。");
  let selectedHtml: string | undefined;
  for (const [index, value] of rawEntries.entries()) {
    // Thumbnail requests need one body, while the descriptor API validates all
    // entries. Keep the package-wide tree limits above for both read paths.
    if (selectedOnly && (value as PreviewEntry)?.id !== selectedId) continue;
    const parsed = previewsSchema.safeParse([value]);
    const duplicate =
      (value as PreviewEntry)?.id &&
      rawEntries.filter(
        (p) => (p as PreviewEntry)?.id === (value as PreviewEntry).id,
      ).length > 1;
    if (!parsed.success || duplicate) {
      descriptor.entries.push({
        id: `invalid-${index}`,
        title:
          typeof (value as PreviewEntry)?.title === "string"
            ? (value as PreviewEntry).title
            : `无效入口 ${index + 1}`,
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
    if (entry.artifact) {
      try {
        const commit = entry.artifact.sourceCommit;
        const provenance = entry.artifact.source;
        let resolved;
        if (provenance) {
          const mount = provenance.submodulePath ?? "";
          const path = inPackage(mount, provenance.packagePath);
          const binding = provenance.bindingCommit ?? revision;
          if (!(await reader.ancestor(binding, revision, signal)))
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "原型父仓库映射基线不属于交付历史。",
              422,
            );
          const owner = path
            ? await resolvePackage(reader, binding, path, signal, false)
            : {
                reader,
                revision,
                mount: "",
                source: {
                  revision,
                  links: [],
                  packagePath: provenance.packagePath,
                },
              };
          const repository =
            owner.source.links.at(-1)?.repository ?? reader.url;
          if (
            owner.mount !== mount ||
            !sameRepository(repository, provenance.repository)
          )
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "原型源码仓库或挂载路径与固定 gitlink 不匹配。",
              422,
            );
          const catalog = provenance.catalogCommit ?? owner.revision;
          await owner.reader.ensureCommit(catalog, signal);
          if (!(await owner.reader.ancestor(commit, catalog, signal)))
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "原型源码提交不属于该子模块清单版本的历史。",
              422,
            );
          resolved = {
            ...owner,
            revision: commit,
            packagePath: provenance.packagePath,
            source: {
              ...owner.source,
              revision: binding,
              packagePath: provenance.packagePath,
              links: owner.source.links.map((link, index, links) =>
                index === links.length - 1 ? { ...link, commit } : link,
              ),
            },
          };
        } else {
          if (
            (await reader.run(["cat-file", "-t", commit], signal))
              .toString()
              .trim() !== "commit" ||
            !(await reader.ancestor(commit, revision, signal))
          )
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "源码基线不属于该固定版本的交付历史。",
              422,
            );
          const modules = await reader.run(
            ["ls-tree", "-z", commit, "--", ".gitmodules"],
            signal,
          );
          if (modules.length) {
            const historical = await readPrototypeConfiguration(
              reader,
              commit,
              limits,
              signal,
            );
            const original = await resolvePackage(
              reader,
              commit,
              historical.packagePath!,
              signal,
              false,
            );
            if (original.source.links.length) resolved = original;
          }
        }
        info.sourceAvailable = true;
        if (resolved) {
          info.source = resolved.source;
          const path = inPackage(resolved.packagePath, "prototype.json");
          const manifest = JSON.parse(
            await body(
              resolved.reader,
              (
                await tree(resolved.reader, resolved.revision, path, signal)
              ).find((file) => file.path === path),
              limits.jsonBytes,
              signal,
            ),
          );
          if (validateManifest(manifest).length)
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "构建基线中的原型清单不合法。",
              422,
            );
          const item = manifest.entries.find(
            (item: any) => item.id === entry.id,
          );
          if (!item || !withinPackage(item.sourcePath, resolved.packagePath))
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "构建基线缺少对应的原型源码入口。",
              422,
            );
          const files = treeRows(
            (
              await resolved.reader.run(
                ["ls-tree", "-lz", resolved.revision, "--", item.sourcePath],
                signal,
              )
            ).toString(),
          );
          if (
            !files.some(
              (file) =>
                file.path === item.sourcePath &&
                ["100644", "100755"].includes(file.mode) &&
                file.kind === "blob",
            )
          )
            throw new AppError(
              "PROTOTYPE_SOURCE",
              "子模块固定版本中的原型源码缺失或不是常规文件。",
              422,
            );
        }
      } catch (error) {
        signal.throwIfAborted();
        info.sourceAvailable = false;
        info.sourceMessage =
          error instanceof AppError
            ? error.message
            : "源码提交已不可用，无法追溯。";
      }
    }
    if (entry.artifact?.type === "hosted") {
      const artifact = entry.artifact;
      info.available = true;
      info.url = artifact.url;
      info.thumbnails = artifact.thumbnails;
      continue;
    }
    const path = entryPath(entry, configuration, changeDirectory),
      file = files.find((f) => f.path === path);
    if (!path) {
      info.message =
        "入口路径不属于默认分支当前配置的原型包或该 Change 的快照目录。";
      continue;
    }
    if (
      !file &&
      packageError &&
      !path.startsWith(`${changeDirectory}/previews/`)
    ) {
      info.message = packageError;
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
      info.blob = file!.blob;
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
