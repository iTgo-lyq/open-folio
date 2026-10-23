"use client";
import { useState } from "react";
import {
  ChevronRight,
  GitBranch,
  KeyRound,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import type { DiscoveredRepository } from "@/server/discovery";
import { usePersonal } from "./personal-context";
import { useWorkspace } from "./context";
import { ConnectDialog, RepositoryCheck } from "./personal-forms";
import styles from "./personal.module.css";

export function PersonalHome() {
  const p = usePersonal();
  const { selectRepository, nav, q } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState<DiscoveredRepository | true | null>(
    null,
  );
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const discover = async () => {
    setFailure("");
    setBusy(true);
    try {
      await p.rediscover(p.discovery?.state !== "complete");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const hasBindings = !!p.session?.connections.length;
  const ready = p.items.filter((i) => i.state === "ready");
  const issues = p.items.filter((i) => i.state !== "ready");
  const name = (item: DiscoveredRepository) => item.repository.displayName;
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.heading}>
          <div>
            <h1>我的仓库</h1>
            {!p.connection && <p>当前账号：{p.session?.account?.username}</p>}
            {p.connection && (
              <p>
                {ready.length} 个可阅读 · 由 Token「{p.connection.label}」发现
              </p>
            )}
          </div>
          {p.connection && (
            <Button onClick={() => setChecking(true)}>
              <Plus />
              添加仓库
            </Button>
          )}
        </header>
        {!p.connection ? (
          <section
            className={styles.onboard}
            aria-labelledby="first-token-title"
          >
            <KeyRound aria-hidden="true" />
            <h2 id="first-token-title">
              {p.restoringConnection
                ? "正在恢复已有 Token…"
                : hasBindings
                  ? "选择已保存的 Token"
                  : "绑定一个 GitHub Token"}
            </h2>
            <p>
              {hasBindings
                ? "Token 已随当前账号保存，无需重新填写。选择已有 Token 即可恢复对应工作台。"
                : "OpenFolio 用你的 Token 读取有权限的仓库，并只列出已接入 SpecTrail 的项目。Token 随账号保存，换浏览器登录后也能直接使用。"}
            </p>
            {p.connectionError && <p role="alert">{p.connectionError}</p>}
            <div className={styles.actions}>
              {hasBindings && (
                <Button
                  variant="primary"
                  loading={p.restoringConnection}
                  onClick={() => nav({ m: "connections" })}
                >
                  选择已有 Token
                </Button>
              )}
              <Button
                variant={hasBindings ? "default" : "primary"}
                onClick={() => setAdding(true)}
              >
                <Plus />
                添加 Token
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost">所需权限</Button>
                </PopoverTrigger>
                <PopoverContent aria-label="Token 所需权限">
                  <strong>Token 所需权限</strong>
                  <p>
                    选择需要阅读的仓库，授予 Contents 与 Pull requests
                    只读权限；Metadata 保持只读。
                  </p>
                </PopoverContent>
              </Popover>
            </div>
          </section>
        ) : (
          <>
            {(failure || p.directoryError) && (
              <div className={styles.banner} role="alert">
                <TriangleAlert />
                <span>{failure || p.directoryError}</span>
                <Button size="sm" onClick={() => void discover()}>
                  重试
                </Button>
              </div>
            )}
            {p.discovery?.state === "running" ? (
              <div className={styles.banner} role="status">
                <RefreshCw className={styles.spin} />
                <span>
                  正在发现仓库 · 已检查 {p.discovery.checked} 个，发现{" "}
                  {p.discovery.found} 个
                </span>
              </div>
            ) : p.discovery && p.discovery.state !== "complete" ? (
              <div className={styles.banner} data-tone="warning" role="status">
                <TriangleAlert />
                <span>
                  {p.discovery.message ??
                    `有 ${p.discovery.failed} 个仓库尚未检查完成。`}
                  {p.discovery.retryAfter && " 请等待平台限流解除后重试。"}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void discover()}
                >
                  继续发现
                </Button>
              </div>
            ) : null}
            {p.unavailable > 0 && (
              <div className={styles.banner} data-tone="warning" role="status">
                <TriangleAlert />
                <span>
                  有 {p.unavailable}{" "}
                  个仓库的权限暂时无法确认，已从当前列表隐藏。
                </span>
                <Button size="sm" onClick={p.reloadDirectory}>
                  重新检查
                </Button>
              </div>
            )}
            <ul className={styles.repoList} aria-label="可阅读的仓库">
              {ready.map((item) => (
                <li key={item.key}>
                  <a
                    className={styles.repoRow}
                    href={`?${new URLSearchParams({ repo: item.key, m: "specs", provider: item.repository.providerId, instance: item.repository.instanceId, repositoryId: item.repository.repositoryId, fullName: item.repository.fullName, integrationBranch: item.integrationBranch })}`}
                    onClick={(e) => {
                      e.preventDefault();
                      selectRepository(
                        item.key,
                        item.repository,
                        item.integrationBranch,
                      );
                    }}
                  >
                    <Avatar name={name(item)} shape="square" size="lg" />
                    <span className={styles.grow}>
                      <span className={styles.repoName}>
                        {name(item)}
                        {item.key === q.repo && <Badge>上次阅读</Badge>}
                      </span>
                      <span className={styles.repoMeta}>
                        <span>{item.repository.fullName}</span>
                        <GitBranch />
                        <span>{item.integrationBranch}</span>
                      </span>
                    </span>
                    <ChevronRight
                      className={styles.chevron}
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
            {!p.items.length && (
              <EmptyState
                title={
                  p.listing
                    ? "正在读取仓库目录…"
                    : p.discovery?.state === "complete"
                      ? "没有发现接入 SpecTrail 的仓库"
                      : "仓库检查尚未完成"
                }
              >
                <p>
                  可以输入仓库地址检查接入情况，或重新发现当前 Token
                  可读取的仓库。
                </p>
                <Button onClick={() => setChecking(true)}>输入仓库地址</Button>
              </EmptyState>
            )}
            <div className={styles.listActions}>
              {p.more && (
                <Button
                  variant="ghost"
                  loading={p.listing}
                  onClick={p.loadMore}
                >
                  加载更多
                </Button>
              )}
              <Button
                variant="ghost"
                loading={busy}
                disabled={p.discovery?.state === "running"}
                onClick={() => void discover()}
              >
                <RefreshCw />
                重新发现
              </Button>
            </div>
            {!!issues.length && (
              <section
                className={styles.issueGroup}
                aria-labelledby="repo-issues-title"
              >
                <h2 id="repo-issues-title">
                  需要处理 <span>{issues.length}</span>
                </h2>
                <ul className={styles.repoList} aria-label="需要处理的仓库">
                  {issues.map((item) => (
                    <li className={styles.repoRow} key={item.key}>
                      <Avatar name={name(item)} shape="square" size="lg" />
                      <span className={styles.grow}>
                        <span className={styles.repoName}>{name(item)}</span>
                        <span className={styles.reason}>
                          <TriangleAlert />
                          {item.message ?? "请核对仓库的 SpecTrail 配置。"}
                        </span>
                      </span>
                      <Button size="sm" onClick={() => setChecking(item)}>
                        重新检查
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {adding && <ConnectDialog onClose={() => setAdding(false)} />}
      {checking && (
        <RepositoryCheck
          item={checking === true ? undefined : checking}
          onClose={() => setChecking(null)}
        />
      )}
    </div>
  );
}
