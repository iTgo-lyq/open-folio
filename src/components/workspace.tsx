"use client";
import { useEffect } from "react";
import { documentReadingTarget } from "@/lib/change-reading";
import { LoaderCircle } from "lucide-react";
import { Button } from "@open-folio/ui";
import { CLEAR_PROTOTYPE_VIEW } from "@/lib/prototypes";
import { useWorkspace, WorkspaceProvider } from "./context";
import { PersonalProvider, usePersonal } from "./personal-context";
import { PersonalHome } from "./personal-home";
import { AccountSettings } from "./account-settings";
import { AccountLogin } from "./account-login";
import { Empty } from "./document";
import { Shell } from "./shell";
import { DocumentSheet } from "./reading-document";
import Specs from "./specs";
import Changes from "./changes";
import Prototypes from "./prototypes";
import styles from "./shell.module.css";
import personalStyles from "./personal.module.css";

// 根据查询参数选择页面；壳层负责导航、顶栏与同步状态。
function Body() {
  const { q, nav, projectId, data, loading, refreshing, error, refresh } =
    useWorkspace();
  const personal = usePersonal();
  const inlineTarget =
    q.doc && data ? documentReadingTarget(data, q.doc) : null;
  useEffect(() => {
    if (inlineTarget)
      nav({ ...inlineTarget, doc: null, da: null, anchor: q.da ?? null }, true);
  }, [q.doc, data?.id]);

  if (!personal.session)
    return (
      <main className={personalStyles.auth}>
        <Empty
          title={
            personal.sessionError ? "工作台暂时无法打开" : "正在恢复个人工作台…"
          }
        >
          {personal.sessionError && (
            <>
              <p>{personal.sessionError}</p>
              <Button onClick={() => void personal.reloadSession()}>
                重试
              </Button>
            </>
          )}
        </Empty>
      </main>
    );
  if (!personal.session.authenticated) return <AccountLogin />;
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
  // 加载和错误入口位于工具栏下方。
  const fallback = (content: React.ReactNode) => (
    <div className={styles.legacy}>{content}</div>
  );
  return (
    <Shell module={module} focusedPreview={focusedPreview} banners={banners}>
      {module === "home" ||
      (!personal.connection && module !== "connections") ? (
        <PersonalHome />
      ) : module === "connections" ? (
        <AccountSettings />
      ) : module === "specs" && data ? (
        <Specs />
      ) : module === "changes" && data ? (
        <Changes />
      ) : module === "prototypes" && data ? (
        <Prototypes />
      ) : (
        fallback(
          !projectId ? (
            <Empty title="先选择一个仓库">
              <Button onClick={() => go("home")}>查看我的仓库</Button>
            </Empty>
          ) : loading && !data ? (
            <Empty
              title={refreshing ? "正在读取中心仓库…" : "正在打开工作台…"}
              icon={<LoaderCircle className={styles.spin} />}
            />
          ) : !data ? (
            <Empty title="暂时没有可读取的版本">
              <p>确认当前连接能够访问该仓库后重试。</p>
              <Button onClick={() => void refresh()} disabled={refreshing}>
                读取中心仓库
              </Button>
            </Empty>
          ) : module === "prototypes" ? (
            <Prototypes />
          ) : (
            <Changes />
          ),
        )
      )}
      {reading && data && !inlineTarget && <DocumentSheet />}
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
