"use client";
import { LoaderCircle } from "lucide-react";
import { Button } from "@open-folio/ui";
import { CLEAR_PROTOTYPE_VIEW } from "@/lib/prototypes";
import { useWorkspace, WorkspaceProvider } from "./context";
import { PersonalProvider, usePersonal } from "./personal-context";
import { Connections, PersonalHome } from "./personal";
import { DocumentModal, Empty, CopyPageLink } from "./document";
import { Shell } from "./shell";
import { ToolbarSlot } from "./toolbar-slot";
import Specs from "./specs";
import Changes from "./changes";
import Prototypes from "./prototypes";
import styles from "./shell.module.css";

// 根据查询参数选择页面；壳层负责导航、顶栏与同步状态。
function Body() {
  const { q, nav, projectId, data, loading, refreshing, error, refresh } =
    useWorkspace();
  const personal = usePersonal();
  const module = (
    ["specs", "changes", "prototypes", "connections"].includes(q.m)
      ? q.m
      : "home"
  ) as "home" | "specs" | "changes" | "prototypes" | "connections";
  const reading = ["specs", "changes", "prototypes"].includes(module),
    focusedPreview = module === "prototypes" && !!q.prototype;
  const go = (m: string) => nav({ m, doc: null, ...CLEAR_PROTOTYPE_VIEW });
  const banners = reading && (
    <>
      {error && (
        <div className={styles.banner} data-tone="error" role="alert">
          <span className={styles.grow}>{error}</span>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            重试
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go("connections")}>
            当前凭据
          </Button>
        </div>
      )}
      {!focusedPreview &&
        data?.diagnostics.map((d, i) => (
          <div className={styles.banner} data-tone="warning" key={i}>
            {d.message}
          </div>
        ))}
    </>
  );
  // 尚未迁移的页面仍放在旧容器中，并从顶栏下方开始。
  const legacy = (content: React.ReactNode) => (
    <div className={styles.legacy}>
      <div className="workspace-body">{content}</div>
    </div>
  );
  return (
    <Shell module={module} focusedPreview={focusedPreview} banners={banners}>
      {reading && data && module !== "specs" && (
        <ToolbarSlot side="right">
          <CopyPageLink />
        </ToolbarSlot>
      )}
      {legacy(
        module === "home" ? (
          <PersonalHome />
        ) : module === "connections" ? (
          <Connections />
        ) : !personal.session?.authenticated ? (
          <PersonalHome />
        ) : !personal.connection ? (
          <Connections />
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
        ),
      )}
      {reading && data && <DocumentModal />}
    </Shell>
  );
}
export default function Workspace() {
  return (
    <PersonalProvider>
      <WorkspaceProvider>
        <Body />
      </WorkspaceProvider>
    </PersonalProvider>
  );
}
