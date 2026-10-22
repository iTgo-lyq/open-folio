"use client";
import { IconButton, EmptyState } from "@open-folio/ui";
import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowUpRight,
  Copy,
  FileText,
  GitBranch,
  Hash,
} from "lucide-react";
import { remarkHeadings, resolveDocumentLink } from "@/lib/markdown";
import type { DocumentRef } from "@/lib/model";
import { useWorkspace } from "./context";
import { reportSharedResourceFailure } from "./api";
import styles from "./document.module.css";
export function Empty({
  title,
  children,
  icon = <FileText size={27} />,
}: {
  title: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <EmptyState title={title} icon={icon}>
      {children}
    </EmptyState>
  );
}
export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.error} role="alert">
      <AlertCircle size={16} />
      <span>{children}</span>
    </div>
  );
}
export function Source({ document }: { document: DocumentRef }) {
  return (
    <div className={styles.source}>
      <span>
        <GitBranch size={13} />
        {document.branch}
      </span>
      <span>
        <Hash size={13} />
        <code title={document.commit}>{document.commit.slice(0, 10)}</code>
      </span>
      <code className={styles.path}>{document.path}</code>
    </div>
  );
}
export function Markdown({
  body,
  document,
  className,
}: {
  body: string;
  className: string;
  document: DocumentRef;
}) {
  const { data, openDocument, notice, nav, q, readUrl, sharing } =
    useWorkspace();
  const prose = useRef<HTMLDivElement>(null);
  const follow = (href: string) => {
    const link = resolveDocumentLink(document.path, href);
    if (link.kind !== "internal") {
      notice("此链接不在可读取的工程文档范围内。");
      return;
    }
    const target = data?.documents.find(
      (d) =>
        d.path === link.path &&
        (link.path.startsWith("docs/project/specs/")
          ? d.branch === data?.selectedBranch
          : d.branch === document.branch && d.commit === document.commit),
    );
    if (!target) {
      notice(
        sharing
          ? `不在本页范围内：${link.path}`
          : `当前提交中找不到 ${link.path}`,
      );
      return;
    }
    if (target.id === document.id) {
      const el = link.hash
        ? prose.current?.querySelector(`#${CSS.escape(link.hash)}`)
        : prose.current;
      if (el) el.scrollIntoView({ block: "start" });
      else if (link.hash) notice("当前文档中未找到该章节。");
      nav(q.doc ? { da: link.hash || null } : { anchor: link.hash || null });
    } else if (!target.readable)
      notice(target.diagnostics[0]?.message ?? "此文件不支持预览。");
    else openDocument(target.id, link.hash);
  };
  return (
    <div className={className} ref={prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHeadings]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const link = resolveDocumentLink(document.path, href ?? "");
            return link.kind === "external" ? (
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {children}
                <ArrowUpRight size={11} className={styles.externalIcon} />
              </a>
            ) : (
              <a
                href={href || "#"}
                onClick={(e) => {
                  e.preventDefault();
                  follow(href ?? "");
                }}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const link = resolveDocumentLink(
              document.path,
              typeof src === "string" ? src : "",
            );
            const ref =
              link.kind === "internal"
                ? data?.documents.find(
                    (d) =>
                      d.path === link.path &&
                      d.branch === document.branch &&
                      d.commit === document.commit &&
                      d.kind === "image" &&
                      d.readable,
                  )
                : undefined;
            return ref ? (
              <img
                alt={alt ?? ""}
                loading="lazy"
                src={readUrl(`assets/${ref.id}?snapshot=${data!.id}`)}
                onError={() =>
                  void reportSharedResourceFailure(
                    readUrl(`assets/${ref.id}?snapshot=${data!.id}`),
                  )
                }
              />
            ) : (
              <span className={styles.imageUnavailable}>
                图片未预览：{alt || "仅支持同一提交内的仓库图片"}
              </span>
            );
          },
          table: ({ children, ...props }) => (
            <div className={styles.table}>
              <table {...props}>{children}</table>
            </div>
          ),
          input: (props) => <input {...props} disabled />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
export function useCopyPageLink(doc?: DocumentRef) {
  const { projectId, data, notice, q, repository, sharing } = useWorkspace();
  return async () => {
    const url = new URL(window.location.href);
    url.hash = "";
    if (!sharing) {
      const allowed = new Set([
        "m",
        "s",
        "c",
        "ct",
        "branch",
        "doc",
        "da",
        "anchor",
        "raw",
        "spec",
        "stage",
        "size",
        "wait",
        "taskStatus",
        "scope",
        "types",
        "noTypes",
        "urgency",
        "creator",
        "group",
        "view",
        "sort",
        "cf",
        "cv",
        "prototype",
        "pdevice",
        "pdetail",
        "pcount",
        "device",
        "orientation",
        "zoom",
        "revision",
        "preview",
      ]);
      for (const key of [...url.searchParams.keys()])
        if (!allowed.has(key)) url.searchParams.delete(key);
      url.searchParams.set("repo", projectId);
      if (data?.integrationBranch)
        url.searchParams.set("integrationBranch", data.integrationBranch);
      if (repository)
        for (const [key, value] of Object.entries({
          provider: repository.providerId,
          instance: repository.instanceId,
          repositoryId: repository.repositoryId,
          fullName: repository.fullName,
        }))
          url.searchParams.set(key, value);
      if (doc && !q.doc) {
        const spec = data?.specs.find((s) => s.documentId === doc.id);
        if (spec) {
          url.searchParams.set("m", "specs");
          url.searchParams.set("s", spec.id);
          url.searchParams.set("branch", doc.branch);
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url.href);
      notice("页面链接已复制。");
    } catch {
      notice("未能复制，请从浏览器地址栏复制链接。");
    }
  };
}
export function CopyPageLink({ document }: { document?: DocumentRef }) {
  const copy = useCopyPageLink(document);
  return (
    <IconButton aria-label="复制页面链接" tooltip onClick={() => void copy()}>
      <Copy />
    </IconButton>
  );
}
