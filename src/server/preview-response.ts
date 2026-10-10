import { readConfig, limitsFor } from "@/server/config";
import { service } from "@/server/service";
import { AppError, publicError } from "@/server/errors";
import { sandboxCsp } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": sandboxCsp,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
export async function handlePreview(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
  current = false,
) {
  try {
    const config = await readConfig();
    const segments = (await context.params).segments;
    const s = current
      ? [segments[0], segments[1], "", ...segments.slice(2)]
      : segments;
    if (s.length !== 5 || s[4] !== "index.html")
      throw new AppError("NOT_FOUND", "原型入口不存在。", 404);
    const project = config.projects.find((p) => p.id === s[0]);
    if (!project)
      throw new AppError("PROJECT_NOT_FOUND", "项目未登记或已移除。", 404);
    const { descriptor, html } = current
      ? await service().currentPreview(
          project,
          s[1],
          limitsFor(config),
          undefined,
          s[3],
          true,
        )
      : await service().preview(
          project,
          s[2],
          s[1],
          limitsFor(config),
          undefined,
          s[3],
        );
    if (html === undefined)
      throw new AppError(
        "PREVIEW_UNAVAILABLE",
        descriptor.message ??
          descriptor.entries.find((e) => e.id === s[3])?.message ??
          "原型入口不可用。",
        404,
      );
    // Diagnostic messages carry only a fixed code and the current load id, never commands.
    const token = new URL(request.url).searchParams.get("load") ?? "";
    const reporter = /^[a-zA-Z0-9-]{1,64}$/.test(token)
      ? `<script>addEventListener('securitypolicyviolation',()=>parent.postMessage({type:'openfolio-preview-error',load:${JSON.stringify(token)},code:'network-blocked'},'*'));addEventListener('error',()=>parent.postMessage({type:'openfolio-preview-error',load:${JSON.stringify(token)},code:'runtime-error'},'*'));</script>`
      : "";
    const insertion = /<head(?:\s[^>]*)?>/i.test(html)
      ? /<head(?:\s[^>]*)?>/i
      : /<!doctype[^>]*>|<html(?:\s[^>]*)?>/i;
    const output = reporter
      ? html.replace(insertion, (m) => m + reporter)
      : html;
    return new Response(request.method === "HEAD" ? null : output, { headers });
  } catch (e) {
    const error = publicError(e);
    return new Response(
      request.method === "HEAD"
        ? null
        : "<!doctype html><meta charset=utf-8><p>原型无法读取，请返回工作台查看入口说明。</p>",
      { status: error.status, headers },
    );
  }
}
