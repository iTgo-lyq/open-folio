import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_LIMITS } from "../lib/model.ts";
import type { AppConfig, Limits } from "../lib/model.ts";
import { AppError } from "./errors.ts";
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const remoteUrl = z
  .string()
  .url()
  .refine((value) => {
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
        })
        .strict(),
    ),
    allowedOrigins: z
      .array(
        z
          .string()
          .url()
          .refine((v) => {
            const u = new URL(v);
            return ["http:", "https:"].includes(u.protocol) && u.origin === v;
          }),
      )
      .optional(),
    limits: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_LIMITS).map((k) => [
            k,
            z.number().int().positive().optional(),
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
      "项目配置不合法，请检查服务端配置文件的字段、项目名称和 HTTPS 仓库地址。",
    );
  if (
    new Set(result.data.projects.map((p) => p.id)).size !==
    result.data.projects.length
  )
    throw new AppError("CONFIG_INVALID", "配置中存在重复的项目 id。");
  return result.data as AppConfig;
}
export async function readConfig(): Promise<AppConfig> {
  if (!process.env.OPENFOLIO_CONFIG) return { schemaVersion: 1, projects: [] };
  try {
    return parseConfig(
      JSON.parse(await readFile(process.env.OPENFOLIO_CONFIG, "utf8")),
    );
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "CONFIG_UNREADABLE",
      "无法读取项目配置，请检查 OPENFOLIO_CONFIG。",
    );
  }
}
export const dataDirectory = () =>
  resolve(
    /* turbopackIgnore: true */ process.env.OPENFOLIO_DATA_DIR ||
      `${homedir()}/.local/share/open-folio`,
  );
export const limitsFor = (config: AppConfig): Limits => ({
  ...DEFAULT_LIMITS,
  ...config.limits,
});
export function checkRequest(
  request: Request,
  config: AppConfig,
  write = false,
) {
  const origins = new Set([
    "http://127.0.0.1:10681",
    "http://localhost:10681",
    ...(config.allowedOrigins ?? []),
  ]);
  const hosts = new Set([...origins].map((o) => new URL(o).host));
  if (!hosts.has(request.headers.get("host") ?? new URL(request.url).host))
    throw new AppError("ORIGIN_DENIED", "当前访问地址不在允许列表中。", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("ORIGIN_DENIED", "不接受跨站点读取。", 403);
  const origin = request.headers.get("origin");
  if ((origin && !origins.has(origin)) || (write && !origin))
    throw new AppError(
      "ORIGIN_DENIED",
      "刷新请求必须来自允许的工作台页面。",
      403,
    );
}
