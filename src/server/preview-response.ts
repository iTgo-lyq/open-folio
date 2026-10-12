import { privateHeaders } from "./personal-http.ts";
import { AppError, publicError } from "./errors.ts";
import { dataDirectory } from "./config.ts";
import { readLegacyBinding } from "./legacy-api.ts";
import { publicPreviews, type PublicPreviews } from "./public-previews.ts";
export async function handlePreview(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
  current = false,
  publications: PublicPreviews = publicPreviews(),
  root = dataDirectory(),
) {
  try {
    const segments = (await context.params).segments;
    const s = current
      ? [segments[0], segments[1], "", ...segments.slice(2)]
      : segments;
    if (
      s.length !== 5 ||
      s[4] !== "index.html" ||
      !/^[a-f0-9]{40,64}$/.test(s[1])
    )
      throw new AppError(
        "PREVIEW_NOT_READY",
        "旧原型尚未准备公开版本，请在个人工作台中打开原仓库并准备。",
        404,
      );
    const key = await readLegacyBinding(root, s[0]);
    if (!key)
      throw new AppError(
        "PREVIEW_NOT_READY",
        "旧原型尚未准备公开版本，请在个人工作台中打开原仓库并准备。",
        404,
      );
    const meta = await publications.resolveAlias(key, {
      revision: s[1],
      change: s[2] || undefined,
      entry: s[3],
    });
    return new Response(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        Location: `/api/public-previews/${meta.id}/index.html`,
      },
    });
  } catch (e) {
    const error = publicError(e);
    return new Response(request.method === "HEAD" ? null : error.message, {
      status: error.status,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
