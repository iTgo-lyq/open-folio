"use client";
import { useEffect, useState } from "react";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import { useWorkspace } from "./context";
import { SharedProvider } from "./shared-context";
import { ChangeReading } from "./change-reading";
import { CopyPageLink, Empty } from "./document";
import { DocumentSheet } from "./reading-document";
import { PublicShell } from "./public-shell";
import { shareParams, type ShareTarget } from "@/lib/share-link";
import styles from "./shared-change.module.css";

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
  if (!target)
    return (
      <PublicShell title="正在读取分享…">
        <div className={styles.empty}>
          <Empty title="正在读取分享…" />
        </div>
      </PublicShell>
    );
  return (
    <SharedProvider key={shareParams(target).toString()} target={target}>
      <SharedReader target={target} />
    </SharedProvider>
  );
}
function SharedReader({ target }: { target: ShareTarget }) {
  const { data, loading, refreshing, refresh, error, message } = useWorkspace();
  const title = target.repository
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\.git$/, "");
  return (
    <PublicShell
      title={title}
      label="只读分享"
      actions={
        <>
          {data && (
            <Popover>
              <PopoverTrigger asChild>
                <IconButton
                  aria-label={
                    error
                      ? "同步状态：同步失败"
                      : refreshing
                        ? "同步状态：正在同步"
                        : "同步状态：已同步"
                  }
                  tooltip
                >
                  {refreshing ? (
                    <RefreshCw className={styles.spinning} />
                  ) : error ? (
                    <TriangleAlert />
                  ) : (
                    <Check />
                  )}
                </IconButton>
              </PopoverTrigger>
              <PopoverContent
                aria-label="分享同步状态"
                align="end"
                className={styles.sync}
              >
                <strong>自动跟随已推送内容</strong>
                <p>
                  {error
                    ? `同步失败：${error}`
                    : "正在阅读最新可读的 Change 材料。"}
                </p>
                <p>
                  最近读取：
                  <time dateTime={data.capturedAt}>
                    {new Date(data.capturedAt).toLocaleString("zh-CN")}
                  </time>
                </p>
                <Button
                  size="sm"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                >
                  <RefreshCw />
                  {refreshing ? "正在同步…" : "检查更新"}
                </Button>
              </PopoverContent>
            </Popover>
          )}
          <CopyPageLink />
        </>
      }
    >
      {!data ? (
        <div className={styles.empty}>
          <Empty
            title={loading ? "正在读取分享…" : error || "内容不存在或暂不可读"}
          >
            {!loading && (
              <>
                <p>请向分享者确认链接，或稍后重试。</p>
                <Button onClick={() => void refresh()}>重试</Button>
              </>
            )}
          </Empty>
        </div>
      ) : (
        <ChangeReading
          group={data.changes[0]}
          banner={
            error ? (
              <div className={styles.warning} role="alert">
                <TriangleAlert />
                <div>
                  同步失败：{error}
                  <p>当前显示上次读取的内容，稍后会自动重试。</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                >
                  重试
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
      {data && <DocumentSheet />}
      {message && (
        <div className={styles.toast} role="status">
          {message}
        </div>
      )}
    </PublicShell>
  );
}
