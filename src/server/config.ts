import {
  link,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_LIMITS } from "../lib/model.ts";
import type { AppConfig, ConfigSnapshot, Limits } from "../lib/model.ts";
import { AppError } from "./errors.ts";
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const remoteUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname !== "/"
    );
  }, "仓库必须是无凭据的 HTTPS 地址");
const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    projects: z.array(
      z
        .object({
          id,
          name: z.string().trim().min(1),
          repositoryUrl: remoteUrl,
          specBranch: z.string().min(1).optional(),
          prototypeOrigins: z
            .array(
              z
                .string()
                .url()
                .refine((value) => {
                  if (!URL.canParse(value)) return false;
                  const u = new URL(value);
                  return (
                    u.protocol === "https:" &&
                    u.origin === value &&
                    !u.username &&
                    !u.password
                  );
                }),
            )
            .optional(),
        })
        .strict(),
    ),
    limits: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_LIMITS).map((k) => [
            k,
            z.number().int().positive().safe().optional(),
          ]),
        ),
      )
      .strict()
      .optional(),
  })
  .strict();
export function parseConfig(value: unknown): AppConfig {
  const result = configSchema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "CONFIG_INVALID",
      "配置不合法，请检查项目字段、HTTPS 仓库和原型来源地址，以及资源限制（必须为正整数）。",
    );
  if (
    new Set(result.data.projects.map((p) => p.id)).size !==
    result.data.projects.length
  )
    throw new AppError("CONFIG_INVALID", "配置中存在重复的项目 id。");
  return result.data as AppConfig;
}
export const dataDirectory = () =>
  resolve(
    /* turbopackIgnore: true */ process.env.OPENFOLIO_DATA_DIR ||
      `${homedir()}/.local/share/open-folio`,
  );
export const configPath = () =>
  resolve(
    /* turbopackIgnore: true */ process.env.OPENFOLIO_CONFIG ||
      join(dataDirectory(), "config.json"),
  );
const serialize = (config: AppConfig) => `${JSON.stringify(config, null, 2)}\n`;
const revisionOf = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const isMissing = (e: unknown) =>
  (e as NodeJS.ErrnoException).code === "ENOENT";
const conflict = () =>
  new AppError(
    "CONFIG_CONFLICT",
    "配置已被修改或移除，请重新加载后再保存。",
    409,
  );

async function initialize(path: string) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(tmp, serialize({ schemaVersion: 1, projects: [] }), {
      flag: "wx",
      mode: 0o600,
    });
    // Publish complete bytes without replacing a file another reader created.
    await link(tmp, path).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EEXIST") throw e;
    });
  } catch {
    throw new AppError(
      "CONFIG_UNWRITABLE",
      "无法创建配置文件，请检查配置目录的写入权限。",
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
async function readState(path: string, create = true): Promise<ConfigSnapshot> {
  let body: string;
  try {
    body = await readFile(path, "utf8").catch(async (e: unknown) => {
      if (!isMissing(e)) throw e;
      if (!create) throw conflict();
      await initialize(path);
      return readFile(path, "utf8");
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "CONFIG_UNREADABLE",
      "无法读取配置文件，请检查配置路径和读取权限。",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new AppError(
      "CONFIG_INVALID_JSON",
      "配置文件不是有效 JSON，请修复文件后重新加载。",
    );
  }
  return {
    config: parseConfig(value),
    revision: revisionOf(body),
    path,
    defaults: DEFAULT_LIMITS,
  };
}
export const readConfigSnapshot = () => readState(configPath());
export const readConfig = async (): Promise<AppConfig> =>
  (await readConfigSnapshot()).config;

const globals = globalThis as typeof globalThis & {
  openfolioConfigWrites?: Map<string, Promise<void>>;
};
export async function saveConfig(
  value: unknown,
  revision: unknown,
): Promise<ConfigSnapshot> {
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
    throw new AppError(
      "CONFIG_REVISION_REQUIRED",
      "请先加载配置，再保存修改。",
      400,
    );
  let config: AppConfig;
  try {
    config = parseConfig(value);
  } catch (e) {
    if (e instanceof AppError) throw new AppError(e.code, e.message, 400);
    throw e;
  }
  const path = configPath();
  let target: string;
  try {
    target = await realpath(path);
  } catch (e) {
    if (isMissing(e)) throw conflict();
    throw new AppError(
      "CONFIG_UNWRITABLE",
      "无法保存配置，请检查配置文件及目录的写入权限。",
    );
  }
  const writes = (globals.openfolioConfigWrites ??= new Map());
  const previous = writes.get(target) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  writes.set(target, pending);
  await previous;
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    const current = await readState(target, false);
    if (current.revision !== revision) throw conflict();
    const body = serialize(config);
    await writeFile(tmp, body, { flag: "wx", mode: 0o600 });
    if ((await readState(target, false)).revision !== revision)
      throw conflict();
    await rename(tmp, target);
    return {
      config,
      revision: revisionOf(body),
      path,
      defaults: DEFAULT_LIMITS,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "CONFIG_UNWRITABLE",
      "无法保存配置，请检查配置文件及目录的写入权限。",
    );
  } finally {
    await unlink(tmp).catch(() => {});
    release();
    if (writes.get(target) === pending) writes.delete(target);
  }
}
export const limitsFor = (config: AppConfig): Limits => ({
  ...DEFAULT_LIMITS,
  ...config.limits,
});
