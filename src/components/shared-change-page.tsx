"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import {
  BookOpen,
  List,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import { primaryRecord, STAGE_LABELS, STATUS_LABELS } from "@/lib/model";
import { useDocument, useWorkspace } from "./context";
import { SharedProvider, documentLocation } from "./shared-context";
import { ChangeDetails } from "./change-materials";
import { ChangeLabels } from "./change-labels";
import {
  CopyPageLink,
  DocumentModal,
  Empty,
  Markdown,
  Source,
} from "./document";
import { shareParams, type ShareTarget } from "@/lib/share-link";
import "./shared-change.css";

const labels: Record<string, string> = {
  "requirement.md": "需求",
  "technical.md": "技术方案",
  "plan.md": "实施计划",
  "execution.md": "执行记录",
  "review.md": "评审记录",
  "merge-technical.md": "合码方案",
};
const tabs = [
  ["overview", "概览"],
  ["tasks", "任务"],
  ["documents", "文档"],
  ["previews", "原型"],
  ["integration", "合入变更"],
  ["evidence", "依据"],
];
export default function SharedChangePage() {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search);
      const value = {
        repository: q.get("repository") ?? "",
        change: q.get("change") ?? "",
        ...(q.has("integrationBranch")
          ? { integrationBranch: q.get("integrationBranch")! }
          : {}),
      };
      setTarget((previous) =>
        previous &&
        shareParams(previous).toString() === shareParams(value).toString()
          ? previous
          : value,
      );
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!target) return <main className="shared-empty">正在读取分享…</main>;
  return (
    <SharedProvider key={shareParams(target).toString()} target={target}>
      <Reader />
    </SharedProvider>
  );
}
function Reader() {
  const {
    data,
    q,
    nav,
    loading,
    refreshing,
    refresh,
    error,
    message,
    openDocument,
  } = useWorkspace();
  const group = data?.changes[0],
    candidate = group && primaryRecord(group),
    state = candidate?.state;
  const documents = (data?.documents ?? [])
    .filter(
      (d) =>
        d.readable &&
        d.kind === "markdown" &&
        candidate?.documentIds.includes(d.id),
    )
    .sort((a, b) => {
      const keys = Object.keys(labels);
      const rank = (path: string) => {
        const n = keys.indexOf(path.split("/").at(-1)!);
        return n < 0 ? 99 : n;
      };
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
    });
  const requested = data?.documents.find(
    (d) => documentLocation(data, d) === q.document,
  );
  const chosen =
    requested ??
    documents.find((d) => d.path.endsWith("/technical.md")) ??
    documents.find((d) => d.path.endsWith("/requirement.md")) ??
    documents[0];
  const tab = tabs.some(([id]) => id === q.ct)
    ? q.ct
    : chosen
      ? "documents"
      : "overview";
  const activeDoc = tab === "documents" ? chosen : undefined;
  const {
    value,
    error: documentError,
    loading: documentLoading,
  } = useDocument(activeDoc?.id);
  const [focused, setFocused] = useState(false),
    [large, setLarge] = useState(false);
  const [directory, setDirectory] = useState<"materials" | "outline" | null>(
    null,
  );
  const [current, setCurrent] = useState(""),
    [progress, setProgress] = useState(0);
  const article = useRef<HTMLElement>(null);
  const directoryFocus = useRef<HTMLElement | null>(null);
  const selectedFromDirectory = useRef(false);
  const showDirectory = (kind: "materials" | "outline") => {
    directoryFocus.current = document.activeElement as HTMLElement;
    selectedFromDirectory.current = false;
    setDirectory(kind);
  };
  const headings = q.raw ? [] : (activeDoc?.headings ?? []);
  useEffect(() => {
    if (!value) return;
    const frame = requestAnimationFrame(() => {
      if (q.anchor)
        article.current
          ?.querySelector(`#${CSS.escape(q.anchor)}`)
          ?.scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [value?.document.id, value?.document.commit, q.anchor, q.raw]);
  useEffect(() => {
    const element = article.current;
    if (!element) return;
    const update = () => {
      const nodes = [
        ...element.querySelectorAll<HTMLElement>(
          ".prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6",
        ),
      ];
      setCurrent(
        nodes.filter((n) => n.getBoundingClientRect().top <= 160).at(-1)?.id ??
          nodes[0]?.id ??
          "",
      );
      const rect = element.getBoundingClientRect();
      setProgress(
        Math.round(
          Math.max(
            0,
            Math.min(
              1,
              (140 - rect.top) /
                Math.max(1, element.scrollHeight - window.innerHeight + 160),
            ),
          ) * 100,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [value, focused, large, tab]);
  const select = (id: string) => {
    selectedFromDirectory.current = !!directory;
    openDocument(id);
    setDirectory(null);
  };
  const materials = (
    <>
      <div className="shared-heading">
        <span className="eyebrow">
          CHANGE <span>只读分享</span>
        </span>
        <h2>{group?.title}</h2>
        <code>{group?.id}</code>
        {state && (
          <p>
            {STATUS_LABELS[state.status]} · {STAGE_LABELS[state.stage]}
          </p>
        )}
        <ChangeLabels state={state} />
      </div>
      <nav className="shared-materials" aria-label="Change 材料">
        <p>材料</p>
        {documents.map((d) => (
          <button
            key={d.id}
            aria-current={activeDoc?.id === d.id ? "page" : undefined}
            onClick={() => select(d.id)}
          >
            <BookOpen size={15} />
            {labels[d.path.split("/").at(-1)!] ?? d.title}
          </button>
        ))}
      </nav>
      <nav className="shared-tabs" aria-label="Change 详情">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              selectedFromDirectory.current = !!directory;
              nav({ ct: id, asset: null });
              setDirectory(null);
              window.scrollTo(0, 0);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="shared-sync">
        <p>自动跟随已推送内容</p>
        <time>{data && new Date(data.capturedAt).toLocaleString("zh-CN")}</time>
        <button onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={13} />
          {refreshing ? "正在同步…" : "检查更新"}
        </button>
      </div>
    </>
  );
  const outline = (
    <>
      <h3>本页目录</h3>
      <nav aria-label="文档章节">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${encodeURIComponent(h.id)}`}
            aria-current={current === h.id ? "location" : undefined}
            style={{ paddingLeft: Math.max(0, h.depth - 1) * 12 + 12 }}
            onClick={(e) => {
              e.preventDefault();
              selectedFromDirectory.current = !!directory;
              nav({ anchor: h.id });
              setDirectory(null);
            }}
          >
            {h.text}
          </a>
        ))}
      </nav>
      <div className="shared-progress">
        已读 {progress}%<progress max={100} value={progress} />
      </div>
    </>
  );
  const index = documents.findIndex((d) => d.id === activeDoc?.id);
  return (
    <div
      className={`shared-page${focused ? " shared-focused" : ""}${large ? " shared-large" : ""}`}
    >
      <header className="shared-topbar">
        <span className="shared-brand">
          OpenFolio <span>/</span>{" "}
          <small>{data?.projectName ?? "Change 分享"}</small>
        </span>
        <CopyPageLink />
      </header>
      {!data ? (
        <main className="shared-empty">
          <Empty title={loading ? "正在读取分享…" : error || "分享不可用"}>
            {!loading && (
              <button className="button" onClick={() => void refresh()}>
                重试
              </button>
            )}
          </Empty>
        </main>
      ) : (
        <div className="shared-layout">
          <aside className="shared-sidebar">{materials}</aside>
          <main className="shared-main">
            <div className="shared-toolbar">
              <button
                className="shared-directory-toggle"
                onClick={() => showDirectory("materials")}
                aria-label="打开材料目录"
              >
                <List size={17} />
              </button>
              <span>
                {tab === "documents"
                  ? (labels[chosen?.path.split("/").at(-1) ?? ""] ??
                    chosen?.title ??
                    "文档")
                  : tabs.find(([id]) => id === tab)?.[1]}
              </span>
              <button
                aria-label="切换大字号"
                aria-pressed={large}
                onClick={() => setLarge((v) => !v)}
              >
                Aa
              </button>
              <button
                aria-label={focused ? "退出专注阅读" : "专注阅读"}
                aria-pressed={focused}
                onClick={() => setFocused((v) => !v)}
              >
                {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                className="shared-outline-toggle"
                aria-label="打开本页目录"
                onClick={() => showDirectory("outline")}
              >
                <List size={17} />
              </button>
            </div>
            {error && (
              <p className="shared-warning" role="alert">
                同步失败：{error} 当前显示上次读取的内容。
                <button onClick={() => void refresh()}>重试</button>
              </p>
            )}
            <article
              ref={article}
              tabIndex={-1}
              className={`shared-article${tab !== "documents" ? " shared-details" : ""}`}
            >
              {tab === "documents" ? (
                <>
                  {q.document && !requested && (
                    <p className="shared-warning">
                      链接中的材料暂不可用，已显示当前可读材料。
                    </p>
                  )}
                  {documentError ? (
                    <Empty title="文档读取失败">
                      <p>{documentError}</p>
                      <button onClick={() => void refresh()}>
                        读取最新版本
                      </button>
                    </Empty>
                  ) : !value ? (
                    <Empty
                      title={documentLoading ? "正在读取文档…" : "暂无文档"}
                    />
                  ) : (
                    <>
                      <div className="shared-document-meta">
                        <Source document={value.document} />
                        <button
                          onClick={() => nav({ raw: q.raw ? null : "1" })}
                        >
                          {q.raw ? "阅读文档" : "查看原文"}
                        </button>
                      </div>
                      {q.raw || value.document.kind === "json" ? (
                        <pre className="raw-document">{value.body}</pre>
                      ) : (
                        <Markdown document={value.document} body={value.body} />
                      )}
                      <nav className="shared-adjacent" aria-label="相邻文档">
                        {index > 0 && (
                          <button
                            onClick={() => select(documents[index - 1].id)}
                          >
                            <small>上一篇</small>
                            {labels[
                              documents[index - 1].path.split("/").at(-1)!
                            ] ?? documents[index - 1].title}
                          </button>
                        )}
                        {index >= 0 && index < documents.length - 1 && (
                          <button
                            onClick={() => select(documents[index + 1].id)}
                          >
                            <small>下一篇</small>
                            {labels[
                              documents[index + 1].path.split("/").at(-1)!
                            ] ?? documents[index + 1].title}
                          </button>
                        )}
                      </nav>
                    </>
                  )}
                </>
              ) : (
                <ChangeDetails
                  key={`${group!.id}:${tab}:${data.id}`}
                  group={group}
                  tab={tab}
                />
              )}
            </article>
          </main>
          <aside className="shared-outline">
            {tab === "documents" && outline}
          </aside>
        </div>
      )}
      <Dialog.Root
        open={!!directory && !!data}
        onOpenChange={(open) => {
          if (!open) setDirectory(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            className="shared-directory-dialog"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (selectedFromDirectory.current
                ? article.current
                : directoryFocus.current
              )?.focus({ preventScroll: true });
            }}
          >
            <header>
              <Dialog.Title>
                {directory === "materials" ? "材料目录" : "本页目录"}
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="关闭目录">
                <X size={18} />
              </Dialog.Close>
            </header>
            {directory === "materials" ? materials : outline}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {data && <DocumentModal />}
      {message && (
        <div className="shared-toast" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
