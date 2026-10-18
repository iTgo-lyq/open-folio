"use client";
import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  Home,
  KeyRound,
  LoaderCircle,
  PanelsTopLeft,
  RefreshCw,
  X,
} from "lucide-react";
import { CLEAR_PROTOTYPE_VIEW } from "@/lib/prototypes";
import { useWorkspace, WorkspaceProvider } from "./context";
import { PersonalProvider, usePersonal } from "./personal-context";
import { Connections, PersonalHome, ConnectionPicker } from "./personal";
import { DocumentModal, Empty, ErrorNotice, CopyPageLink } from "./document";
import Specs from "./specs";
import Changes from "./changes";
import Prototypes from "./prototypes";
import { Button } from "@open-folio/ui";
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
    selectRepository,
  } = useWorkspace();
  const personal = usePersonal();
  const [collapsed, setCollapsed] = useState(false);
  const module = ["specs", "changes", "prototypes", "connections"].includes(q.m)
    ? q.m
    : "home";
  const reading = ["specs", "changes", "prototypes"].includes(module),
    focusedPreview = module === "prototypes" && !!q.prototype;
  const titles: Record<string, string> = {
    home: "我的仓库",
    connections: "当前凭据",
    specs: "Specs",
    changes: "Changes",
    prototypes: "原型",
  };
  useEffect(() => {
    setCollapsed(
      personal.session?.workspace?.preferences.railCollapsed ?? false,
    );
  }, [
    personal.session?.workspace?.id,
    personal.session?.workspace?.preferences.railCollapsed,
  ]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    void personal
      .updatePreferences({ railCollapsed: next })
      .catch((e) => notice(e.message));
  };
  const go = (m: string) =>
    nav({
      m,
      doc: null,
      ...CLEAR_PROTOTYPE_VIEW,
    });
  const navigation = (
    <nav className="module-nav" aria-label="模块导航">
      {[
        { id: "home", title: "仓库", icon: Home },
        { id: "specs", title: "Specs", icon: BookOpen },
        { id: "changes", title: "Changes", icon: GitPullRequest },
        { id: "prototypes", title: "原型", icon: PanelsTopLeft },
      ].map((item, index) => (
        <span className="personal-nav-item" key={item.id}>
          {index === 1 && <span className="personal-nav-divider" />}
          <a
            href={`?${new URLSearchParams({ ...q, m: item.id })}`}
            aria-label={item.title}
            aria-current={module === item.id ? "page" : undefined}
            aria-disabled={
              item.id !== "home" && (!projectId || !personal.connection)
                ? true
                : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              if (item.id === "home" || (projectId && personal.connection))
                go(item.id);
            }}
          >
            <item.icon size={20} />
            <span>{item.title}</span>
          </a>
        </span>
      ))}
    </nav>
  );
  return (
    <div
      className={`app-shell ${collapsed ? "rail-collapsed" : ""} ${focusedPreview ? "preview-focused" : ""}`}
    >
      {!focusedPreview && (
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
          <button
            className="rail-footer"
            title="当前凭据"
            aria-label="当前凭据"
            onClick={() => go("connections")}
          >
            <KeyRound size={17} />
          </button>
        </aside>
      )}
      <main className="workspace">
        <header className="workspace-header">
          <div className="header-context">
            <label className="project-select">
              <span className="project-monogram">
                {reading
                  ? (
                      projects.find((p) => p.id === projectId)?.name || "O"
                    ).slice(0, 1)
                  : "O"}
              </span>
              <select
                aria-label="当前仓库"
                value={reading ? projectId : ""}
                onChange={(e) =>
                  e.target.value ? selectRepository(e.target.value) : go("home")
                }
              >
                <option value="">个人工作台</option>
                {projectId && !projects.some((p) => p.id === projectId) && (
                  <option value={projectId}>
                    {q.fullName ?? "分享的仓库"}
                  </option>
                )}
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ChevronRight size={14} className="header-chevron" />
            {focusedPreview ? (
              <button
                className="preview-back"
                onClick={() => nav(CLEAR_PROTOTYPE_VIEW)}
                aria-label="返回原型总览"
              >
                原型总览
              </button>
            ) : (
              <span className="header-module">{titles[module]}</span>
            )}
            {reading && <span className="read-only">只读</span>}
          </div>
          <div className="header-actions">
            <button
              className="icon-button settings-mobile-trigger"
              aria-label="当前凭据"
              onClick={() => go("connections")}
            >
              <KeyRound size={18} />
            </button>
            {focusedPreview && (
              <select
                aria-label="跳转工作台模块"
                className="preview-module-select"
                value={module}
                onChange={(e) => go(e.target.value)}
              >
                <option value="prototypes">原型</option>
                <option value="specs">Specs</option>
                <option value="changes">Changes</option>
                <option value="home">我的仓库</option>
              </select>
            )}
            {reading && !focusedPreview && (
              <>
                <details className="header-source">
                  <summary aria-label="查看读取状态">
                    <GitBranch size={14} />
                    <span className="header-source-label">
                      {module === "changes"
                        ? `${data?.collaborationBranch ?? "待接入"} 入口`
                        : (data?.selectedBranch ?? "协作分支")}
                    </span>
                    <span className="snapshot-time">
                      {refreshing
                        ? "正在读取…"
                        : data
                          ? new Date(data.capturedAt).toLocaleTimeString(
                              "zh-CN",
                              { hour12: false },
                            )
                          : "尚未读取"}
                    </span>
                  </summary>
                  <div className="header-source-details">
                    <strong>读取来源</strong>
                    <span>
                      {module === "specs"
                        ? `${data?.selectedBranch ?? "协作分支"} · 预发布`
                        : module === "prototypes"
                          ? `${data?.collaborationBranch ?? "协作分支"} · 预发布 / 当前页面`
                          : `${data?.collaborationBranch ?? "协作分支"} 入口 / 登记的 Change 来源`}
                    </span>
                    <span>{personal.connection?.label}</span>
                    <span>
                      {refreshing
                        ? "正在读取…"
                        : data
                          ? `读取于 ${new Date(data.capturedAt).toLocaleString("zh-CN", { hour12: false })}`
                          : "尚未读取"}
                    </span>
                  </div>
                </details>
                {data && module !== "specs" && <CopyPageLink />}
                <button
                  className="icon-button refresh-button"
                  onClick={() => void refresh()}
                  disabled={!personal.connection || refreshing}
                  aria-label={refreshing ? "正在读取中心仓库" : "刷新中心仓库"}
                >
                  <RefreshCw size={17} className={refreshing ? "spin" : ""} />
                </button>
              </>
            )}
          </div>
        </header>
        {reading && error && (
          <ErrorNotice>
            {error}
            <Button variant="text" onClick={() => void refresh()}>
              重试
            </Button>
            <Button variant="text" onClick={() => go("connections")}>
              当前凭据
            </Button>
          </ErrorNotice>
        )}
        {reading &&
          !focusedPreview &&
          data?.diagnostics.map((d, i) => (
            <div className="source-warning" key={i}>
              {d.message}
            </div>
          ))}
        <div className="workspace-body">
          {module === "home" ? (
            <PersonalHome />
          ) : module === "connections" ? (
            <Connections />
          ) : !personal.session?.connected ? (
            <PersonalHome />
          ) : !personal.connection ? (
            <Empty title="用自己的连接打开仓库">
              <p>请选择具有该仓库读取权限的连接。</p>
              <ConnectionPicker />
            </Empty>
          ) : !projectId ? (
            <Empty title="先选择一个仓库">
              <Button onClick={() => go("home")}>查看我的仓库</Button>
            </Empty>
          ) : loading && !data ? (
            <Empty
              title={refreshing ? "正在读取中心仓库…" : "正在打开工作台…"}
              icon={<LoaderCircle className="spin" />}
            />
          ) : !data ? (
            <Empty title="暂时没有可读取的版本">
              <p>确认当前连接能够访问该仓库后重试。</p>
              <Button onClick={() => void refresh()} disabled={refreshing}>
                读取中心仓库
              </Button>
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
      {!focusedPreview && <div className="mobile-navigation">{navigation}</div>}
      {reading && data && <DocumentModal />}
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
export default function Workspace() {
  return (
    <PersonalProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </PersonalProvider>
  );
}
