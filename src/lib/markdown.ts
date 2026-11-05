import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { isMap, parseDocument } from "yaml";
import type { Heading } from "./model.ts";
type AstNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  identifier?: string;
  children?: AstNode[];
  position?: { start: { line: number } };
  data?: Record<string, unknown>;
};
export function markdownWithoutFrontMatter(body: string): string {
  const opening = /^\uFEFF?---[ \t]*(?:\r\n?|\n)/.exec(body);
  if (!opening) return body;
  const rest = body.slice(opening[0].length);
  const closing = /(?:^|[\r\n])---[ \t]*(?=[\r\n]|$)/.exec(rest);
  if (!closing) return body;

  try {
    const metadata = parseDocument(rest.slice(0, closing.index), {
      prettyErrors: false,
    });
    if (metadata.errors.length || !isMap(metadata.contents)) return body;
  } catch {
    return body;
  }

  // Keep line numbers and offsets relative to the original document.
  const end = opening[0].length + closing.index + closing[0].length;
  return body.slice(0, end).replace(/[^\r\n]/g, " ") + body.slice(end);
}
export const parseMarkdown = (body: string) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdownWithoutFrontMatter(body));
export const nodeText = (node: AstNode): string =>
  node.value ?? (node.children ?? []).map(nodeText).join("");
export function headingId(text: string, seen: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-") || "section";
  let id = base,
    n = 0;
  while (seen.has(id)) id = `${base}-${++n}`;
  seen.set(id, 1);
  return id;
}
export function inspectMarkdown(body: string) {
  const tree = parseMarkdown(body) as AstNode;
  const headings: Heading[] = [],
    links: { url: string; line: number }[] = [];
  const definitions = new Map<string, string>();
  function collect(n: AstNode) {
    if (
      n.type === "definition" &&
      n.identifier &&
      n.url &&
      !definitions.has(n.identifier)
    )
      definitions.set(n.identifier, n.url);
    n.children?.forEach(collect);
  }
  collect(tree);
  const seen = new Map<string, number>();
  function visit(n: AstNode) {
    if (n.type === "heading")
      headings.push({
        id: headingId(nodeText(n), seen),
        text: nodeText(n),
        depth: n.depth!,
        line: n.position?.start.line ?? 1,
      });
    if (n.type === "link" && n.url)
      links.push({ url: n.url, line: n.position?.start.line ?? 1 });
    if (
      n.type === "linkReference" &&
      n.identifier &&
      definitions.has(n.identifier)
    )
      links.push({
        url: definitions.get(n.identifier)!,
        line: n.position?.start.line ?? 1,
      });
    n.children?.forEach(visit);
  }
  visit(tree);
  const title =
    headings.find((heading) => heading.depth === 1)?.text ?? headings[0]?.text;
  return { title, headings, links, tree };
}
export function remarkHeadings() {
  return (tree: unknown) => {
    const seen = new Map<string, number>();
    function visit(n: AstNode) {
      if (n.type === "heading")
        n.data = {
          ...n.data,
          hProperties: { id: headingId(nodeText(n), seen) },
        };
      n.children?.forEach(visit);
    }
    visit(tree as AstNode);
  };
}
export type ResolvedLink =
  | { kind: "internal"; path: string; hash: string }
  | { kind: "external"; url: string }
  | { kind: "invalid" };
export function resolveDocumentLink(from: string, href: string): ResolvedLink {
  try {
    if (/^https?:\/\//i.test(href)) {
      const url = new URL(href);
      return !url.username && !url.password
        ? { kind: "external", url: url.href }
        : { kind: "invalid" };
    }
    if (
      /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href) ||
      /[\\\u0000-\u001f]/.test(href)
    )
      return { kind: "invalid" };
    const hashAt = href.indexOf("#");
    const raw = hashAt < 0 ? href : href.slice(0, hashAt);
    const hash = hashAt < 0 ? "" : decodeURIComponent(href.slice(hashAt + 1));
    const decoded = decodeURIComponent(raw);
    if (
      /[\\\u0000-\u001f?]/.test(decoded) ||
      /%[0-9a-f]{2}/i.test(decoded) ||
      /[\u0000-\u001f]/.test(hash)
    )
      return { kind: "invalid" };
    const full = !decoded
      ? from
      : decoded.startsWith("/")
        ? decoded.slice(1)
        : from.slice(0, from.lastIndexOf("/") + 1) + decoded;
    const stack: string[] = [];
    for (const part of full.split("/")) {
      if (part === "..") {
        if (!stack.length) return { kind: "invalid" };
        stack.pop();
      } else if (part && part !== ".") stack.push(part);
    }
    const path = stack.join("/");
    return path.startsWith("docs/project/")
      ? { kind: "internal", path, hash }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}
