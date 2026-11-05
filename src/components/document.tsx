"use client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  EmptyState,
} from "@open-folio/ui";
import { createContext, useContext, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Lightbox from "yet-another-react-lightbox";
import Inline from "yet-another-react-lightbox/plugins/inline";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import {
  AlertCircle,
  ArrowUpRight,
  FileText,
  GitBranch,
  Hash,
  X,
} from "lucide-react";
import {
  markdownWithoutFrontMatter,
  remarkHeadings,
  resolveDocumentLink,
} from "@/lib/markdown";
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
const InsideDocumentLink = createContext(false);

export function DocumentImage({
  src,
  alt,
  loading,
  className,
}: {
  src: string;
  alt: string;
  loading?: "lazy";
  className?: string;
}) {
  const linked = useContext(InsideDocumentLink);
  const reportError = () => void reportSharedResourceFailure(src);
  const image = (
    <img src={src} alt={alt} loading={loading} onError={reportError} />
  );
  if (linked) return image;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={[styles.imageTrigger, className].filter(Boolean).join(" ")}
          aria-label={alt ? `放大查看：${alt}` : "放大查看图片"}
        >
          {image}
        </button>
      </DialogTrigger>
      <DialogContent
        className={styles.lightbox}
        aria-describedby={undefined}
        onErrorCapture={reportError}
      >
        <DialogTitle className={styles.lightboxTitle}>
          {alt || "图片预览"}
        </DialogTitle>
        <Lightbox
          plugins={[Inline, Zoom]}
          slides={[{ src, alt }]}
          carousel={{ finite: true, preload: 0 }}
          styles={{ container: { touchAction: "none" } }}
          zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
          labels={{ "Zoom in": "放大", "Zoom out": "缩小" }}
          render={{
            buttonPrev: () => null,
            buttonNext: () => null,
            iconError: () => <span role="status">图片加载失败</span>,
          }}
          toolbar={{
            buttons: [
              <DialogClose asChild key="close">
                <button
                  type="button"
                  className="yarl__button"
                  aria-label="关闭大图"
                  title="关闭大图"
                >
                  <X aria-hidden="true" />
                </button>
              </DialogClose>,
            ],
          }}
        />
      </DialogContent>
    </Dialog>
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
            const content = (
              <InsideDocumentLink.Provider value={true}>
                {children}
              </InsideDocumentLink.Provider>
            );
            return link.kind === "external" ? (
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {content}
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
                {content}
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
              <DocumentImage
                alt={alt ?? ""}
                loading="lazy"
                src={readUrl(`assets/${ref.id}?snapshot=${data!.id}`)}
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
        {markdownWithoutFrontMatter(body)}
      </ReactMarkdown>
    </div>
  );
}
