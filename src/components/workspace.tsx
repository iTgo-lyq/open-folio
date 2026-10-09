"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import {
  BookOpen,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  PanelLeftClose,
  PanelsTopLeft,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { SearchResult } from "@/lib/model";
import { api, useWorkspace, WorkspaceProvider } from "./context";
import { DocumentModal, Empty, ErrorNotice } from "./document";
import Specs from "./specs";
import Changes from "./changes";
import Prototypes from "./prototypes";
function Shell() {
  const {
    q,
    nav,
    projects,
    projectId,
    data,
    loading,
    refreshing,
    error,
    refresh,
    message,
    notice,
  } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(false);
  const module =
    q.m === "prototypes"
      ? "prototypes"
      : q.m === "changes"
        ? "changes"
        : "specs";
  const moduleTitle =
    module === "prototypes"
      ? "原型"
      : module === "changes"
        ? "Changes"
        : "Specs";
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("openfolio.rail") === "closed");
    } catch {}
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const toggle = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem("openfolio.rail", v ? "open" : "closed");
      } catch {}
      return !v;
    });
  const navigation = (
    <nav className="module-nav" aria-label="模块导航">
      {[
        { id: "specs", title: "Specs", icon: BookOpen },
        { id: "changes", title: "Changes", icon: GitPullRequest },
        { id: "prototypes", title: "原型", icon: PanelsTopLeft },
      ].map((item) => (
        <a
          key={item.id}
          href={`?project=${encodeURIComponent(projectId)}&m=${item.id}`}
          aria-label={item.title}
          aria-current={module === item.id ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            nav({
              m: item.id,
              doc: null,
              c: null,
              ct: null,
              prototype: null,
              preview: null,
              device: null,
              orientation: null,
              revision: null,
              zoom: null,
            });
          }}
        >
          <item.icon size={20} />
          <span>{item.title}</span>
        </a>
      ))}
    </nav>
  );
  return (
    <div className={`app-shell ${collapsed ? "rail-collapsed" : ""}`}>
      <aside className="module-rail">
        <button
          className="shell-brand"
          onClick={toggle}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          <img src="/brand/openfolio-mark.png" alt="OpenFolio" />
          <span className="restore-handle" />
        </button>
        {navigation}
        <div className="rail-footer" title="只读工作台">
          <span>OF</span>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div className="header-context">
            <label className="project-select">
              <span className="project-monogram">
                {(projects.find((p) => p.id === projectId)?.name || "O").slice(
                  0,
                  1,
                )}
              </span>
              <select
                aria-label="当前项目"
                value={projectId}
                onChange={(e) =>
                  nav({
                    project: e.target.value,
                    branch: null,
                    s: null,
                    c: null,
                    doc: null,
                    anchor: null,
                    filter: null,
                    spec: null,
                    stage: null,
                    size: null,
                    wait: null,
                    taskStatus: null,
                    scope: null,
                    ct: null,
                    da: null,
                    raw: null,
                    prototype: null,
                    preview: null,
                    device: null,
                    orientation: null,
                    revision: null,
                    zoom: null,
                    pq: null,
                    pkind: null,
                    pdevice: null,
                  })
                }
              >
                {!projects.length && <option value="">OpenFolio</option>}
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ChevronRight size={14} className="header-chevron" />
            <span className="header-module">{moduleTitle}</span>
            <span className="read-only">只读</span>
          </div>
          <div className="header-actions">
            <button
              className="search-launch"
              onClick={() => setSearch(true)}
              aria-label="搜索工作台"
            >
              <Search size={16} />
              <span>搜索文档、变更…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button refresh-button"
              onClick={() => void refresh()}
              disabled={!projectId || refreshing}
              aria-label={refreshing ? "正在读取中心仓库" : "刷新中心仓库"}
              title="读取最新已推送记录"
            >
              <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>
        <div className="workspace-source">
          <div className="row">
            <GitBranch size={14} />
            {module === "specs" ? (
              <select
                aria-label="Specs 来源分支"
                value={data?.selectedBranch ?? q.branch ?? ""}
                onChange={(e) =>
                  nav({
                    branch: e.target.value || null,
                    s: null,
                    anchor: null,
                    doc: null,
                  })
                }
              >
                <option value="">选择来源分支</option>
                {data?.branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {data.protectedBranches.includes(b.name)
                      ? " · 守护分支"
                      : ""}
                  </option>
                ))}
              </select>
            ) : module === "prototypes" ? (
              <span>
                main <span className="source-separator">/</span> 当前页面
              </span>
            ) : (
              <span>
                全部已推送分支 <span className="source-separator">/</span> 各
                Change 主来源
              </span>
            )}
          </div>
          <span className="snapshot-time">
            {refreshing
              ? "正在读取…"
              : data
                ? `读取于 ${new Date(data.capturedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`
                : "尚未读取"}
          </span>
        </div>
        {error && (
          <ErrorNotice>
            {error}
            {data && " 当前继续显示上次成功版本。"}
            <button className="text-button" onClick={() => void refresh()}>
              重试
            </button>
          </ErrorNotice>
        )}
        {data?.diagnostics.map((d, i) => (
          <div className="source-warning" key={i}>
            {d.message}
          </div>
        ))}
        <div className="workspace-body">
          {loading && !data ? (
            <Empty
              title={refreshing ? "正在读取中心仓库…" : "正在打开工作台…"}
              icon={<LoaderCircle className="spin" />}
            />
          ) : !projects.length ? (
            <Empty title="连接你的中心 Git 仓库">
              <p>尚未登记项目。请在服务端配置项目后重新打开工作台。</p>
              <code>OPENFOLIO_CONFIG</code>
            </Empty>
          ) : !data ? (
            <Empty title="暂时没有可读取的版本">
              <p>检查仓库访问权限后重新读取。</p>
              <button
                className="button"
                onClick={() => void refresh()}
                disabled={refreshing}
              >
                读取中心仓库
              </button>
            </Empty>
          ) : module === "specs" ? (
            <Specs />
          ) : module === "prototypes" ? (
            <Prototypes />
          ) : (
            <Changes />
          )}
        </div>
      </main>
      <div className="mobile-navigation">{navigation}</div>
      <SearchDialog open={search} setOpen={setSearch} />
      <DocumentModal />
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            aria-label="关闭提示"
            className="icon-button"
            onClick={() => notice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function SearchDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { data, projectId, q, nav, openDocument } = useWorkspace(),
    [term, setTerm] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const kind = ["changes", "prototypes"].includes(q.m) ? "changes" : "specs";
  useEffect(() => {
    if (!open || !data || !term.trim()) {
      setResults([]);
      setBusy(false);
      setError("");
      return;
    }
    const c = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      void api<{ results: SearchResult[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/search?snapshot=${data.id}&kind=${kind}${data.selectedBranch ? `&branch=${encodeURIComponent(data.selectedBranch)}` : ""}&q=${encodeURIComponent(term)}`,
        { signal: c.signal },
      )
        .then((r) => setResults(r.results))
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [term, open, data, projectId, kind]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="search-dialog"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (q.c || q.doc) e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">
            搜索 {kind === "specs" ? "Specs" : "Changes"}
          </Dialog.Title>
          <div className="search-dialog-input">
            <Search size={20} />
            <input
              autoFocus
              aria-label="全文搜索"
              placeholder={`搜索 ${kind === "specs" ? "能力标题、路径或正文" : "Change、任务或正文"}…`}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <Dialog.Close className="icon-button" aria-label="关闭搜索">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="search-results">
            {error && <ErrorNotice>{error}</ErrorNotice>}
            {busy ? (
              <p className="muted inset">正在搜索…</p>
            ) : results.length ? (
              results.map((r, i) => (
                <button
                  className="search-result"
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    if (r.specId)
                      nav({ m: "specs", s: r.specId, anchor: null });
                    else if (r.documentId && r.changeId)
                      nav({
                        m: "changes",
                        c: r.changeId,
                        ct: "documents",
                        doc: r.documentId,
                        da: null,
                        raw: null,
                      });
                    else if (r.changeId)
                      nav({
                        m: "changes",
                        c: r.changeId,
                        ct: r.taskId ? "tasks" : "overview",
                      });
                    else if (r.documentId) openDocument(r.documentId);
                  }}
                >
                  <strong>{r.title}</strong>
                  <span>{r.excerpt}</span>
                  <code>{r.path}</code>
                </button>
              ))
            ) : (
              <p className="muted inset">
                {term.trim() ? "没有找到匹配记录" : "搜索当前来源中的真实文档"}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export default function Workspace() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
