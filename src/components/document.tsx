"use client";
import { Button, IconButton, EmptyState } from "@open-folio/ui";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog } from "radix-ui";
import {
  AlertCircle,
  ArrowUpRight,
  Braces,
  Check,
  Copy,
  FileText,
  GitBranch,
  Hash,
  X,
} from "lucide-react";
import { remarkHeadings, resolveDocumentLink } from "@/lib/markdown";
import type { DocumentRef } from "@/lib/model";
import { useDocument, useSavedScroll, useWorkspace } from "./context";
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
    <div className="error-notice" role="alert">
      <AlertCircle size={16} />
      <span>{children}</span>
    </div>
  );
}
export function Source({ document }: { document: DocumentRef }) {
  return (
    <div className="source-block">
      <span>
        <GitBranch size={13} />
        {document.branch}
      </span>
      <span>
        <Hash size={13} />
        <code title={document.commit}>{document.commit.slice(0, 10)}</code>
      </span>
      <code className="source-path">{document.path}</code>
    </div>
  );
}
export function Markdown({
  body,
  document,
}: {
  body: string;
  document: DocumentRef;
}) {
  const { data, projectId, openDocument, notice, nav, q, readUrl } =
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
        d.branch === document.branch &&
        d.commit === document.commit,
    );
    if (!target) {
      notice(`当前提交中找不到 ${link.path}`);
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
    <div className="prose" ref={prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHeadings]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const link = resolveDocumentLink(document.path, href ?? "");
            return link.kind === "external" ? (
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {children}
                <ArrowUpRight size={11} className="inline-icon" />
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
              />
            ) : (
              <span className="image-unavailable">
                图片未预览：{alt || "仅支持同一提交内的仓库图片"}
              </span>
            );
          },
          input: (props) => <input {...props} disabled />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
export function CopyPageLink({ document: doc }: { document?: DocumentRef }) {
  const { projectId, data, notice, q, repository } = useWorkspace();
  return (
    <button
      className="text-button"
      aria-label="复制页面链接"
      onClick={async () => {
        const url = new URL(window.location.href);
        url.hash = "";
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
          "filter",
          "spec",
          "stage",
          "size",
          "wait",
          "taskStatus",
          "scope",
        ]);
        for (const key of [...url.searchParams.keys()])
          if (!allowed.has(key)) url.searchParams.delete(key);
        url.searchParams.set("repo", projectId);
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
        try {
          await navigator.clipboard.writeText(url.href);
          notice("页面链接已复制。");
        } catch {
          notice("未能复制，请从浏览器地址栏复制链接。");
        }
      }}
    >
      <Copy size={13} />
      <span>复制链接</span>
    </button>
  );
}
export function DocumentContent({
  id,
  raw = false,
  anchor,
  compact = false,
}: {
  id: string;
  raw?: boolean;
  anchor?: string;
  compact?: boolean;
}) {
  const { data, projectId, openDocument, nav, q, refresh } = useWorkspace(),
    { value, error, loading } = useDocument(id);
  const scroll = useSavedScroll(
    `${projectId}.${value?.document.branch}.${id}.${raw ? "raw" : "rendered"}.${value ? "loaded" : "pending"}`,
    anchor,
  );
  return (
    <div className={`document-layout ${compact ? "compact" : ""}`}>
      <div className="document-scroll" ref={scroll}>
        {error ? (
          <Empty title="暂时无法读取文档" icon={<AlertCircle />}>
            <p>{error}</p>
            <Button onClick={() => void refresh()}>读取最新版本</Button>
          </Empty>
        ) : !value ? (
          <Empty title={loading ? "正在读取文档…" : "选择一份文档"} />
        ) : (
          <>
            <div className="document-topline">
              <span className="eyebrow">
                {value.document.kind === "json"
                  ? "SOURCE RECORD"
                  : value.document.path.includes("/specs/")
                    ? "CAPABILITY SPEC"
                    : "CHANGE DOCUMENT"}
              </span>
              <div className="row">
                <CopyPageLink document={value.document} />
                <button
                  className="text-button"
                  onClick={() => openDocument(id, "", !raw)}
                >
                  <Braces size={14} />
                  {raw ? "阅读文档" : "查看原文"}
                </button>
              </div>
            </div>
            {!raw && value.document.headings.length > 0 && (
              <select
                className="compact-toc"
                aria-label="跳转到章节"
                value={anchor ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  nav(q.doc ? { da: id } : { anchor: id });
                  scroll.current
                    ?.querySelector(`#${CSS.escape(id)}`)
                    ?.scrollIntoView({ block: "start" });
                }}
              >
                <option value="">本页目录</option>
                {value.document.headings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.text}
                  </option>
                ))}
              </select>
            )}
            {raw || value.document.kind === "json" ? (
              <>
                <h1 className="raw-title">{value.document.title}</h1>
                <pre className="raw-document">{value.body}</pre>
              </>
            ) : (
              <Markdown body={value.body} document={value.document} />
            )}
            <footer className="document-footer">
              <span>来自已推送提交</span>
              <Source document={value.document} />
            </footer>
          </>
        )}
      </div>
      {value && !compact && (
        <aside className="document-aside">
          <span className="eyebrow">本页目录</span>
          <nav aria-label="文档章节">
            {value.document.headings.map((h) => (
              <a
                key={h.id}
                href={`#${encodeURIComponent(h.id)}`}
                style={{ paddingLeft: Math.max(0, h.depth - 1) * 12 }}
                onClick={(e) => {
                  e.preventDefault();
                  nav({ anchor: h.id });
                  scroll.current
                    ?.querySelector(`#${CSS.escape(h.id)}`)
                    ?.scrollIntoView({ block: "start" });
                }}
              >
                {h.text}
              </a>
            ))}
          </nav>
          <div className="aside-source">
            <span className="eyebrow">来源</span>
            <Source document={value.document} />
            <span className="muted">
              读取于{" "}
              {data &&
                new Date(data.capturedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  hour12: false,
                })}
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}
export function DocumentModal() {
  const { q, nav, data } = useWorkspace();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!q.doc || !data) {
      setReady(false);
      return;
    }
    let frame: number;
    const show = () => {
      // Mount the parent focus scope before opening a document from a deep link
      // or search result. Simultaneous modal roots can hide one another from AT.
      if (
        q.m === "changes" &&
        q.c &&
        !window.document.querySelector(".change-drawer")
      ) {
        frame = requestAnimationFrame(show);
        return;
      }
      setReady(true);
    };
    frame = requestAnimationFrame(show);
    return () => cancelAnimationFrame(frame);
  }, [q.doc, q.c, q.m, data?.id]);
  const open = !!q.doc && !!data && ready;
  const previousFocus = useRef<HTMLElement | null>(null);
  const ref = data?.documents.find((d) => d.id === q.doc);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) nav({ doc: null, da: null, raw: null });
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="document-modal"
          onOpenAutoFocus={() => {
            previousFocus.current = window.document
              .activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            previousFocus.current?.focus();
          }}
          aria-describedby={undefined}
        >
          <header className="modal-header">
            <Dialog.Title>{ref?.path.split("/").at(-1) ?? "文档"}</Dialog.Title>
            <div className="row">
              <button
                className="text-button"
                onClick={() => nav({ raw: q.raw ? null : "1" })}
              >
                <Braces size={14} />
                {q.raw ? "阅读" : "原文"}
              </button>
              <Dialog.Close asChild>
                <IconButton aria-label="关闭文档">
                  <X size={19} />
                </IconButton>
              </Dialog.Close>
            </div>
          </header>
          {ref?.kind === "image" ? (
            <ImageDocument doc={ref} />
          ) : (
            q.doc && (
              <DocumentContent
                id={q.doc}
                raw={q.raw === "1"}
                anchor={q.da}
                compact
              />
            )
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function ImageDocument({ doc }: { doc: DocumentRef }) {
  const { projectId, data, readUrl } = useWorkspace();
  return (
    <div className="image-document">
      <img
        alt={doc.title}
        src={readUrl(`assets/${doc.id}?snapshot=${data?.id}`)}
      />
      <Source document={doc} />
    </div>
  );
}
