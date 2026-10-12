import { personalJson } from "@/server/personal-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function retired() {
  return personalJson(
    {
      error: {
        code: "PERSONAL_CONNECTION_REQUIRED",
        message: "请用自己的 GitHub 连接打开个人工作台。",
      },
    },
    410,
  );
}
export const GET = retired;
export const HEAD = retired;
export const POST = retired;
