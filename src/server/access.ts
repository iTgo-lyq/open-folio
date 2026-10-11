import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "../lib/model.ts";
import { dataDirectory, readConfig } from "./config.ts";
import { AppError } from "./errors.ts";

const digest = (value: string) => createHash("sha256").update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
export const adminPasswordPath = () => join(dataDirectory(), "admin-password");
async function privateSecret(path: string) {
  try {
    return await readFile(path, "utf8")
      .catch(async (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
        await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
        const tmp = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(tmp, `${randomBytes(32).toString("base64url")}\n`, {
            flag: "wx",
            mode: 0o600,
          });
          await link(tmp, path).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
        } finally {
          await unlink(tmp).catch(() => {});
        }
        return readFile(path, "utf8");
      })
      .then((value) => {
        const secret = value.trim();
        if (!secret) throw new Error("Empty secret file");
        return secret;
      });
  } catch {
    throw new AppError(
      "ACCESS_SECRET_UNAVAILABLE",
      "无法读取或创建访问凭据，请检查数据目录中的 admin-password、access-secret 文件及权限。",
    );
  }
}
export async function adminPassword(): Promise<string> {
  return (
    process.env.OPENFOLIO_ADMIN_PASSWORD || privateSecret(adminPasswordPath())
  );
}
async function signingCredentials() {
  const [password, key] = await Promise.all([
    adminPassword(),
    privateSecret(join(dataDirectory(), "access-secret")),
  ]);
  return { password, key };
}
const cookieName = (project?: ProjectConfig) =>
  project
    ? `openfolio-project-${digest(project.id).toString("hex").slice(0, 24)}`
    : "openfolio-admin";
const token = (
  { password, key }: { password: string; key: string },
  project?: ProjectConfig,
) =>
  createHmac("sha256", key)
    .update(
      JSON.stringify(
        project
          ? [
              "project-v1",
              digest(password).toString("hex"),
              project.id,
              project.inviteCode,
            ]
          : ["admin-v1", digest(password).toString("hex")],
      ),
    )
    .digest("base64url");
function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export async function accessFor(request: Request) {
  const credentials = await signingCredentials();
  const admin = equal(cookie(request, cookieName()), token(credentials));
  return {
    admin,
    canRead: (project: ProjectConfig) =>
      admin ||
      (!!project.inviteCode &&
        equal(
          cookie(request, cookieName(project)),
          token(credentials, project),
        )),
  };
}
export async function requireAdmin(request: Request) {
  if (!(await accessFor(request)).admin)
    throw new AppError("ADMIN_REQUIRED", "请先输入管理密码。", 401);
}
export async function requireProject(request: Request, project: ProjectConfig) {
  if (!(await accessFor(request)).canRead(project))
    throw new AppError("INVITE_REQUIRED", "请输入项目邀请码。", 401);
}
// Recheck after long reads: rotation/removal must also apply to in-flight responses.
export async function recheckProject(request: Request, id: string) {
  const project = (await readConfig()).projects.find((p) => p.id === id);
  if (!project)
    throw new AppError("PROJECT_NOT_FOUND", "项目未登记或已移除。", 404);
  await requireProject(request, project);
}
export async function login(
  request: Request,
  secret: string,
  project?: ProjectConfig,
) {
  const credentials = await signingCredentials();
  const expected = project ? project.inviteCode : credentials.password;
  if (!expected || !equal(secret, expected))
    throw new AppError(
      "ACCESS_DENIED",
      project ? "邀请码不正确或已更换。" : "管理密码不正确。",
      401,
    );
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return `${cookieName(project)}=${token(credentials, project)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure ? "; Secure" : ""}`;
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin &&
      (!URL.canParse(origin) ||
        new URL(origin).host !==
          (request.headers.get("host") ?? new URL(request.url).host)))
  )
    throw new AppError("ORIGIN_DENIED", "请从本站页面提交请求。", 403);
}
