import type {
  CurrentPrototype,
  CurrentPrototypeEntry,
  Limits,
  PreviewDescriptor,
  ProjectConfig,
  Snapshot,
} from "../lib/model.ts";
import type { PrototypeCatalog } from "../lib/prototypes.ts";
import type { GitReader } from "./git.ts";
import {
  body,
  tree,
  resolveEntries,
  readPrototypeConfiguration,
} from "./previews.ts";
import { identity } from "./schema.ts";
import {
  validateManifest,
  currentPreview,
} from "../../.agents/skills/spec-trail/prototype/scripts/contract.mjs";
import { AppError } from "./errors.ts";

export async function readCurrentPrototype(
  reader: GitReader,
  revision: string | undefined,
  limits: Limits,
  signal: AbortSignal,
  configurationRevision = revision,
): Promise<CurrentPrototype> {
  const base: CurrentPrototype = {
    revision: revision ?? null,
    entries: [],
    issues: [],
  };
  if (!revision)
    return { ...base, message: "项目没有 main 分支，无法读取当前页面。" };
  try {
    const configuration = await readPrototypeConfiguration(
      reader,
      configurationRevision,
      limits,
      signal,
    );
    base.packagePath = configuration.packagePath;
    base.configuration = configuration;
    const path = `${configuration.packagePath}/prototype.json`;
    const entries = await tree(reader, revision, path, signal);
    if (!entries.length)
      return {
        ...base,
        message:
          "该版本在 main 当前配置的原型包路径下尚未登记 prototype.json。",
      };
    const manifest = JSON.parse(
      await body(
        reader,
        entries.find((f) => f.path === path),
        Math.min(limits.jsonBytes, limits.totalBytes),
        signal,
      ),
    );
    if (
      !manifest ||
      typeof manifest !== "object" ||
      validateManifest({ ...manifest, entries: [] }).length ||
      !Array.isArray(manifest.entries) ||
      manifest.entries.length > limits.previewEntries
    )
      return {
        ...base,
        message: "该版本的 prototype.json 格式或入口数量不合法。",
      };
    const seen = new Map<unknown, number>();
    for (const entry of manifest.entries)
      seen.set(entry?.id, (seen.get(entry?.id) ?? 0) + 1);
    for (const [index, entry] of manifest.entries.entries()) {
      if (
        validateManifest({ schemaVersion: 1, entries: [entry] }).length ||
        seen.get(entry?.id) !== 1 ||
        !entry.sourcePath.startsWith(`${configuration.packagePath}/`)
      ) {
        base.issues.push(
          `第 ${index + 1} 项字段不合法、id 重复或源码不在原型包内。`,
        );
        continue;
      }
      base.entries.push(entry as CurrentPrototypeEntry);
    }
    return base;
  } catch (e) {
    signal.throwIfAborted();
    return {
      ...base,
      message:
        e instanceof AppError ? e.message : "该版本的原型清单不是有效 JSON。",
    };
  }
}
export function prototypeCatalog(
  source: Snapshot,
  policy: Snapshot["prototype"],
): PrototypeCatalog {
  const current = source.currentPrototype;
  return {
    snapshotId: source.id,
    revision: current.revision,
    policy,
    items:
      policy.status === "enabled"
        ? current.entries.map((entry) => ({ ...entry }))
        : [],
    issues: current.issues,
    message: policy.status !== "enabled" ? policy.message : current.message,
  };
}
export async function resolveCurrentPreview(
  reader: GitReader,
  latest: Snapshot,
  source: Snapshot,
  project: ProjectConfig,
  revision: string | undefined,
  limits: Limits,
  selectedId?: string,
  selectedOnly = false,
) {
  if (
    (revision && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) ||
    (selectedId && !identity.safeParse(selectedId).success)
  )
    throw new AppError("INVALID_PARAMETER", "原型入口或版本参数不合法。", 400);
  let current = source.currentPrototype;
  const descriptor: PreviewDescriptor = {
    changeId: "",
    revision: revision ?? current.revision,
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
  const main = latest.branches.find((b) => b.name === "main")?.commit;
  const target = revision ?? current.revision;
  if (!main || !target) return fail("项目没有 main 分支，无法读取当前页面。");
  const signal = AbortSignal.timeout(limits.refreshMs);
  if (!(await reader.ancestor(target, main, signal)))
    return fail("该版本不在 main 的已推送历史中。");
  current =
    target === main
      ? latest.currentPrototype
      : await readCurrentPrototype(reader, target, limits, signal, main);
  if (current.message) return fail(current.message);
  if (current.issues.length) {
    descriptor.message = current.issues.join("；");
    descriptor.failed = true;
    if (selectedId && !current.entries.some((e) => e.id === selectedId))
      return fail(descriptor.message);
  }
  const entries = current.entries.filter(
    (e) => !selectedOnly || e.id === selectedId,
  );
  const result = await resolveEntries(
    reader,
    latest.projectId,
    descriptor,
    target,
    current.configuration!,
    entries.filter((e) => e.artifact).map(currentPreview),
    limits,
    project,
    selectedId,
    selectedOnly,
  );
  result.descriptor.entries.push(
    ...entries
      .filter((e) => !e.artifact)
      .map((e) => ({
        ...e,
        available: false,
        message: "此页面尚未登记已发布产物。",
      })),
  );
  return result;
}
