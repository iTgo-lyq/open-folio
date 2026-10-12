import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.ts";
import type { AppConfig } from "../lib/model.ts";
const projectSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().trim().min(1),
    repositoryUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname !== "/"
        );
      }),
    inviteCode: z.string().trim().min(1).max(256).optional(),
    specBranch: z.string().min(1).optional(),
    prototypeOrigins: z.unknown().optional(),
  })
  .strict();
export const legacySchema = z
  .object({
    schemaVersion: z.literal(1),
    projects: z.array(projectSchema),
    limits: z.unknown().optional(),
  })
  .strict()
  .refine(
    (v) => new Set(v.projects.map((p) => p.id)).size === v.projects.length,
  );
const locks = new Map<string, Promise<void>>();
export async function migrateLegacyConfig(
  path: string,
  root: string,
  original: string,
  config: AppConfig,
) {
  const target = await realpath(path);
  const previous = locks.get(target) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  locks.set(target, pending);
  await previous;
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    if ((await readFile(target, "utf8")) !== original) return;
    const legacy = legacySchema.parse(JSON.parse(original));
    const directory = join(root, "legacy-v1");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const hash = createHash("sha256").update(original).digest("hex");
    const backup = join(directory, `config-${hash}.json`);
    await writeFile(backup, original, { flag: "wx", mode: 0o600 }).catch(
      async (e: NodeJS.ErrnoException) => {
        if (
          e.code !== "EEXIST" ||
          (await readFile(backup, "utf8")) !== original
        )
          throw e;
      },
    );
    // Write the private locator before changing the config; a crash can be retried.
    const mapping = JSON.stringify({
      schemaVersion: 1,
      projects: legacy.projects.map(({ id, repositoryUrl, specBranch }) => ({
        id,
        repositoryUrl,
        specBranch,
      })),
    });
    const mapTemporary = join(directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(mapTemporary, mapping, { flag: "wx", mode: 0o600 });
      await rename(mapTemporary, join(directory, "projects.json"));
    } finally {
      await unlink(mapTemporary).catch(() => {});
    }
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    if ((await readFile(target, "utf8")) !== original)
      throw new AppError("CONFIG_CONFLICT", "旧配置已改变，请重新加载。", 409);
    await rename(temporary, target);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "CONFIG_MIGRATION_FAILED",
      "无法备份并迁移旧配置；原文件已保留，请检查私有数据目录权限。",
      503,
    );
  } finally {
    await unlink(temporary).catch(() => {});
    release();
    if (locks.get(target) === pending) locks.delete(target);
  }
}
export async function legacyProject(root: string, id: string) {
  try {
    const value = JSON.parse(
      await readFile(join(root, "legacy-v1", "projects.json"), "utf8"),
    );
    const parsed = z
      .object({
        schemaVersion: z.literal(1),
        projects: z.array(
          projectSchema
            .pick({ id: true, repositoryUrl: true, specBranch: true })
            .strict(),
        ),
      })
      .strict()
      .parse(value);
    return parsed.projects.find((p) => p.id === id);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new AppError(
      "LEGACY_MAPPING_UNAVAILABLE",
      "旧链接映射不可用，请从个人仓库目录重新选择。",
      503,
    );
  }
}
