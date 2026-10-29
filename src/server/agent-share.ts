import "server-only";
import { parser, resolveDocumentLink } from "../lib/markdown.ts";
import { primaryRecord, type DocumentRef } from "../lib/model.ts";
import type { SharedChange } from "../lib/shared-change.ts";
import {
  agentSharePath,
  sharePath,
  sharedReadUrl,
  type ShareTarget,
} from "../lib/share-link.ts";
import { AppError } from "./errors.ts";

export const AGENT_BODY_BYTES = 512 * 1024;
const order = [
  "requirement.md",
  "technical.md",
  "plan.md",
  "research.md",
  "execution.md",
  "review.md",
  "merge-technical.md",
  "change.json",
];
type MarkdownNode = {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  position?: { start: { offset: number }; end: { offset: number } };
};
const label = (value: string) => value.replace(/[\[\]\\`\r\n]/g, " ");
const markdownUrl = (url: string) =>
  url.replace(/[()<>]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);

// Locate only the destination so code blocks, labels, titles and formatting stay intact.
function labelEnd(raw: string, definition: boolean) {
  let depth = 1,
    at = raw.startsWith("!") ? 2 : 1;
  for (; at < raw.length && depth; at++) {
    if (raw[at] === "\\") {
      at++;
      continue;
    }
    if (!definition && raw[at] === "`") {
      const run = raw.slice(at).match(/^`+/)![0];
      const close = raw.indexOf(run, at + run.length);
      if (close >= 0) {
        at = close + run.length - 1;
        continue;
      }
    }
    if (raw[at] === "[") depth++;
    if (raw[at] === "]") depth--;
  }
  return depth ? undefined : at;
}
function destination(raw: string, definition: boolean) {
  let at = labelEnd(raw, definition);
  if (at === undefined || raw[at] !== (definition ? ":" : "(")) return;
  while (/\s/.test(raw[++at] ?? "") && at < raw.length) {}
  if (raw[at] === "<") {
    const start = ++at;
    while (at < raw.length) {
      if (raw[at] === "\\") at++;
      else if (raw[at] === ">") return { start, end: at };
      at++;
    }
  } else {
    const start = at;
    let parens = 0;
    for (; at < raw.length; at++) {
      if (raw[at] === "\\") {
        at++;
        continue;
      }
      if (/\s/.test(raw[at])) break;
      if (raw[at] === "(") parens++;
      if (raw[at] === ")" && parens-- === 0) break;
    }
    return { start, end: at };
  }
}

export async function renderAgentShare({
  data,
  target,
  origin,
  document: selected,
  readDocument,
}: {
  data: SharedChange;
  target: ShareTarget;
  origin: string;
  document?: string;
  readDocument: (id: string) => Promise<Buffer>;
}) {
  const record = primaryRecord(data.change);
  if (!record)
    throw new AppError(
      "SHARE_SOURCE_UNAVAILABLE",
      "该 Change 的来源暂不可用。",
      404,
    );
  const directory = record.directory;
  const documents = data.documents.filter(
    (d) =>
      record.documentIds.includes(d.id) &&
      d.branch === record.branch &&
      d.commit === record.commit &&
      d.path.startsWith(`${record.directory}/`),
  );
  const relative = (d: DocumentRef) =>
    d.path.slice(record.directory.length + 1);
  const texts = documents
    .filter((d) => ["markdown", "json"].includes(d.kind))
    .sort((a, b) => {
      const rank = (d: DocumentRef) => {
        const i = order.indexOf(relative(d));
        return i < 0 ? order.length : i;
      };
      return rank(a) - rank(b) || relative(a).localeCompare(relative(b), "en");
    });
  const chosen =
    selected === undefined
      ? undefined
      : texts.find((d) => relative(d) === selected);
  if (selected !== undefined && !chosen)
    throw new AppError(
      "DOCUMENT_NOT_FOUND",
      "文档未包含在此 Change 的文本分享中。",
      404,
    );
  const absolute = (path: string) => new URL(path, origin).href;
  const textUrl = (d: DocumentRef, hash = "") =>
    absolute(
      agentSharePath(target, {
        document: relative(d),
        snapshot: data.snapshotId,
      }),
    ) + (hash ? `#${encodeURIComponent(hash)}` : "");
  const assetUrl = (d: DocumentRef) =>
    absolute(
      sharedReadUrl(
        target,
        `assets/${encodeURIComponent(d.id)}?snapshot=${encodeURIComponent(data.snapshotId)}`,
      ),
    );
  function rewrite(body: string, from: DocumentRef) {
    const edits: { start: number; end: number; url: string }[] = [],
      missing = new Set<string>();
    const names = new Map<string, string>();
    const reference = (id: string) => {
      if (!names.has(id)) names.set(id, `of-${from.id}-${names.size + 1}`);
      return names.get(id)!;
    };
    function visit(node: MarkdownNode) {
      if (
        selected === undefined &&
        node.identifier &&
        node.position &&
        [
          "definition",
          "linkReference",
          "imageReference",
          "footnoteDefinition",
          "footnoteReference",
        ].includes(node.type)
      ) {
        const start = node.position.start.offset,
          end = node.position.end.offset;
        const afterLabel = labelEnd(
          body.slice(start, end),
          node.type === "definition" || node.type.startsWith("footnote"),
        );
        if (afterLabel !== undefined) {
          edits.push(
            node.type.startsWith("footnote")
              ? {
                  start: start + 2,
                  end: start + afterLabel - 1,
                  url: reference(`footnote:${node.identifier}`),
                }
              : node.type === "definition"
                ? {
                    start: start + 1,
                    end: start + afterLabel - 1,
                    url: reference(node.identifier),
                  }
                : {
                    start: start + afterLabel,
                    end,
                    url: `[${reference(node.identifier)}]`,
                  },
          );
        }
      }
      if (
        ["link", "image", "definition"].includes(node.type) &&
        node.url !== undefined &&
        node.position
      ) {
        const link = resolveDocumentLink(from.path, node.url);
        if (link.kind !== "external") {
          const active = `docs/project/changes/${data.change.id}/`;
          const logical = resolveDocumentLink(
            `${active}${relative(from)}`,
            node.url,
          );
          const paths = [link, logical].flatMap((resolved) =>
            resolved.kind === "internal"
              ? [
                  resolved.path,
                  ...(resolved.path.startsWith(active)
                    ? [`${directory}/${resolved.path.slice(active.length)}`]
                    : []),
                ]
              : [],
          );
          const ref = documents.find((d) => paths.includes(d.path));
          let url =
            ref?.kind === "image"
              ? assetUrl(ref)
              : ref && ["markdown", "json"].includes(ref.kind)
                ? textUrl(ref, link.kind === "internal" ? link.hash : "")
                : undefined;
          if (!url) {
            missing.add(node.url);
            url = "#share-reference-unavailable";
          }
          const start = node.position.start.offset,
            raw = body.slice(start, node.position.end.offset);
          const range = destination(raw, node.type === "definition");
          if (range)
            edits.push({
              start: start + range.start,
              end: start + range.end,
              url: markdownUrl(url),
            });
        }
      }
      node.children?.forEach(visit);
    }
    visit(parser().parse(body) as MarkdownNode);
    for (const edit of edits.sort((a, b) => b.start - a.start))
      body = body.slice(0, edit.start) + edit.url + body.slice(edit.end);
    if (missing.size)
      body += `\n\n引用说明：以下引用未包含在此 Change 的分享范围内：${[...missing].map(label).join("、")}。\n`;
    return body;
  }
  const lines = [
    `# ${label(data.change.title)}\n`,
    `项目：${label(data.projectName)}  \nChange：${data.change.id}  \n仓库：${target.repository}  \n集成分支：${label(target.integrationBranch ?? "")}  \n材料分支：${label(record.branch)}  \n材料提交：${record.commit}  \n快照：${data.snapshotId}  \n采集时间：${data.capturedAt}\n`,
    `网页阅读：${absolute(sharePath(target))}  \n重新读取入口：${absolute(agentSharePath(target))}\n`,
    "本次返回使用同一快照；入口跟随已推送内容，分篇和附件链接固定于当前快照。若链接报告版本变化，请重新读取入口。图片和原型仅提供引用，视觉内容需打开原资源查看。\n",
    "## 状态与协作上下文\n",
    record.state
      ? `\`\`\`json\n${JSON.stringify(record.state, null, 2)}\n\`\`\`\n`
      : "流程状态不可解析，请读取 change.json 并核对诊断。\n",
    ...data.change.diagnostics.map((d) => `- ${label(d.message)}\n`),
    ...(data.delivery
      ? [
          `交付信息：\n\n\`\`\`json\n${JSON.stringify(data.delivery, null, 2)}\n\`\`\`\n`,
        ]
      : []),
    "## 材料目录\n",
    ...texts.map(
      (d) =>
        `- [${label(relative(d))}](${textUrl(d)})${d.readable ? "" : "（正文不可读）"}\n`,
    ),
  ];
  const oversized =
    !chosen &&
    texts.reduce((total, d) => total + d.bytes, 0) > AGENT_BODY_BYTES;
  if (oversized)
    lines.push(
      "\n材料正文合计超过 512 KiB，本次未包含任何材料正文；以上目录列出全部分篇链接，请按需读取。\n",
    );
  else {
    for (const d of chosen ? [chosen] : texts) {
      lines.push(
        `\n---\n\n## 文件：${label(relative(d))}\n\n来源路径：${label(d.path)}  \n分支：${label(d.branch)}  \n提交：${d.commit}\n`,
      );
      if (!d.readable) {
        lines.push("\n该材料正文不可读；未包含正文。\n");
        continue;
      }
      const body = (await readDocument(d.id)).toString("utf8");
      lines.push(
        d.kind === "json"
          ? `\n\`\`\`json\n${body}\n\`\`\`\n`
          : `\n${rewrite(body, d)}\n`,
      );
    }
  }
  lines.push("\n## 附件与原型引用\n");
  for (const d of documents.filter((d) => d.kind === "image"))
    lines.push(
      `- 图片 [${label(relative(d))}](${assetUrl(d)})：视觉内容未转写为文字。\n`,
    );
  for (const preview of record.state?.previews ?? []) {
    const url =
      preview.artifact?.type === "hosted"
        ? preview.artifact.url
        : absolute(
            sharedReadUrl(
              target,
              `previews/${encodeURIComponent(preview.id)}/index.html?snapshot=${encodeURIComponent(data.snapshotId)}`,
            ),
          );
    lines.push(
      `- 原型 [${label(preview.title)}](${markdownUrl(url)})：固定产物源码提交 ${preview.artifact?.sourceCommit ?? "未登记"}，界面与交互需打开查看。\n`,
    );
  }
  return lines.join("\n");
}
