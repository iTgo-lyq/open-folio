import { privateHeaders } from "./personal-http.ts";
export async function handlePreview(
  request: Request,
  _context: { params: Promise<{ segments: string[] }> },
  _current = false,
) {
  return new Response(
    request.method === "HEAD"
      ? null
      : "请在个人工作台中用自己的连接准备原型，再使用公开链接。",
    {
      status: 410,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}
