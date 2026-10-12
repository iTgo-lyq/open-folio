import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDirectory } from "./config.ts";
import { AppError } from "./errors.ts";

const digest = (value: string) => createHash("sha256").update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
export const adminPasswordPath = () => join(dataDirectory(), "admin-password");
export async function privateSecret(path: string) {
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
      "无法读取或创建访问凭据，请检查数据目录及文件权限。",
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
const cookieName = () => "openfolio-admin";
const token = ({ password, key }: { password: string; key: string }) =>
  createHmac("sha256", key)
    .update(JSON.stringify(["admin-v1", digest(password).toString("hex")]))
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
export async function requireAdmin(request: Request) {
  const credentials = await signingCredentials();
  if (!equal(cookie(request, cookieName()), token(credentials)))
    throw new AppError("ADMIN_REQUIRED", "需要部署管理凭据。", 401);
}
export async function login(request: Request, secret: string) {
  const credentials = await signingCredentials();
  if (!equal(secret, credentials.password))
    throw new AppError("ACCESS_DENIED", "管理密码不正确。", 401);
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return `${cookieName()}=${token(credentials)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure ? "; Secure" : ""}`;
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
