"use client";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Github,
  KeyRound,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  EmptyState,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  Input,
  IconButton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@open-folio/ui";
import { usePersonal } from "./personal-context";
import { useWorkspace } from "./context";
import { api } from "./api";
import type { ConnectionSummary } from "@/server/personal-sessions";
import type { DiscoveredRepository } from "@/server/discovery";
import { ErrorNotice } from "./document";
export function ConnectionPicker() {
  const { session, connection, selectConnection } = usePersonal();
  return (
    <select
      aria-label="当前连接"
      value={connection?.id ?? ""}
      onChange={(e) => selectConnection(e.target.value)}
    >
      <option value="" disabled>
        选择自己的连接
      </option>
      {session?.connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label} · @{c.identity.login}
        </option>
      ))}
    </select>
  );
}
export function PersonalHome() {
  const p = usePersonal(),
    { nav, selectRepository } = useWorkspace();
  const [connect, setConnect] = useState(false),
    [check, setCheck] = useState(false),
    [term, setTerm] = useState(""),
    [filter, setFilter] = useState("all"),
    [failure, setFailure] = useState("");
  const discover = async () => {
    setFailure("");
    try {
      await p.rediscover(p.discovery?.state !== "complete");
    } catch (e) {
      setFailure((e as Error).message);
    }
  };
  const items = p.items.filter(
    (i) =>
      (filter === "all" || i.state === filter) &&
      i.repository.fullName.toLowerCase().includes(term.toLowerCase()),
  );
  if (!p.session)
    return (
      <EmptyState
        title={p.sessionError ? "工作台暂时无法打开" : "正在恢复个人工作台…"}
      >
        {p.sessionError && (
          <>
            <p>{p.sessionError}</p>
            <Button onClick={() => void p.reloadSession()}>重试</Button>
          </>
        )}
      </EmptyState>
    );
  return (
    <>
      <section
        className={p.session.connected ? "personal-home" : "personal-welcome"}
      >
        {!p.session.connected ? (
          <div className="personal-welcome-inner">
            <div className="personal-welcome-mark">
              <img src="/brand/openfolio-mark.png" alt="" />
              OpenFolio
            </div>
            <h1>
              你的工程工作台，
              <br />
              从连接 GitHub 开始。
            </h1>
            <p>
              自动发现你有权读取、已接入 SpecTrail 的仓库。Specs、Changes
              和原型，都回到同一份工程记录。
            </p>
            <Button variant="primary" onClick={() => setConnect(true)}>
              <Github data-icon="inline-start" />
              连接 GitHub
            </Button>
            <div className="personal-welcome-route">
              <span>连接账号</span>
              <ChevronRight size={14} />
              <span>发现仓库</span>
              <ChevronRight size={14} />
              <span>开始阅读</span>
            </div>
            <p className="personal-small">
              访问范围跟随你的 GitHub token；已发布原型可以公开分享。
            </p>
          </div>
        ) : (
          <>
            <div className="personal-intro">
              <div>
                <div className="eyebrow">YOUR WORKBENCH</div>
                <h1>我的仓库</h1>
                <p>把正在参与的工程，放回清晰的上下文。</p>
              </div>
              <Button onClick={() => nav({ m: "connections" })}>
                <Plus data-icon="inline-start" />
                管理连接
              </Button>
            </div>
            <div className="personal-connection-context">
              <ConnectionPicker />
              <span className="muted">使用所选连接的读取权限</span>
            </div>
            {(failure || p.directoryError) && (
              <ErrorNotice>
                {failure || p.directoryError}
                <Button variant="text" onClick={() => void discover()}>
                  重试发现
                </Button>
                <Button
                  variant="text"
                  onClick={() => nav({ m: "connections" })}
                >
                  更新连接
                </Button>
              </ErrorNotice>
            )}
            {p.discovery?.state === "running" ? (
              <div className="personal-notice" role="status">
                <strong>正在发现你的 SpecTrail 仓库</strong>
                <p>
                  已检查 {p.discovery.checked} 个仓库，发现 {p.discovery.found}{" "}
                  个。你可以先打开已发现的仓库。
                </p>
                <div className="personal-progress">
                  <span />
                </div>
              </div>
            ) : p.discovery && p.discovery.state !== "complete" ? (
              <div className="personal-notice warning" role="status">
                <strong>部分仓库尚未检查完成</strong>
                <p>
                  {p.discovery.message ??
                    `有 ${p.discovery.failed} 个仓库暂时无法检查。`}
                  {p.discovery.retryAfter && " 请等待平台限流解除后重试。"}
                </p>
                <Button onClick={() => void discover()}>继续发现</Button>
              </div>
            ) : null}
            {p.unavailable > 0 && (
              <ErrorNotice>
                有 {p.unavailable} 个仓库的权限暂时无法确认，已从当前列表隐藏。
                <Button variant="text" onClick={p.reloadDirectory}>
                  重新检查
                </Button>
              </ErrorNotice>
            )}
            <div className="personal-toolbar">
              <label className="personal-search">
                <Search size={16} />
                <Input
                  aria-label="搜索仓库"
                  placeholder="搜索仓库名称…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </label>
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList aria-label="仓库状态">
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="ready">可阅读</TabsTrigger>
                  <TabsTrigger value="attention">需要关注</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {!p.connection ? (
              <EmptyState title="选择一个连接">
                <p>
                  每次读取都使用你明确选择的 token。请从上方选择本次使用的连接。
                </p>
              </EmptyState>
            ) : items.length ? (
              <>
                <div className="personal-list-head">
                  <span>仓库</span>
                  <span>阅读来源</span>
                  <span>状态</span>
                  <span />
                </div>
                {items.map((item) => (
                  <a
                    href={`?${new URLSearchParams({ repo: item.key, m: "specs", provider: item.repository.providerId, instance: item.repository.instanceId, repositoryId: item.repository.repositoryId, fullName: item.repository.fullName })}`}
                    className="personal-repo-row"
                    key={item.key}
                    onClick={(e) => {
                      e.preventDefault();
                      selectRepository(item.key);
                    }}
                  >
                    <div className="row">
                      <span className="personal-repo-symbol">
                        {item.repository.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{item.repository.displayName}</strong>
                        <div className="personal-repo-meta">
                          {item.repository.fullName}
                        </div>
                        <p>{item.message ?? "Specs、Changes 与项目原型"}</p>
                      </div>
                    </div>
                    <span className="personal-repo-source">
                      <GitBranch size={13} />{" "}
                      {item.specBranch ??
                        item.repository.defaultBranch ??
                        "待检查"}
                    </span>
                    <Badge
                      tone={item.state === "ready" ? "success" : "warning"}
                    >
                      {item.state === "ready" ? "可阅读" : "需要关注"}
                    </Badge>
                    <ChevronRight size={15} />
                  </a>
                ))}
              </>
            ) : (
              <EmptyState
                title={
                  p.listing
                    ? "正在读取仓库目录…"
                    : term || filter !== "all"
                      ? "没有匹配的仓库"
                      : p.discovery?.state === "complete"
                        ? "还没有发现 SpecTrail 仓库"
                        : "仓库检查尚未完成"
                }
              >
                <p>
                  {p.discovery?.state === "complete"
                    ? "确认 token 已选择目标仓库，并具有 Contents 只读权限。仓库默认分支需要有效的 SpecTrail 配置。"
                    : "开始或继续发现，或用仓库地址检查接入情况。"}
                </p>
              </EmptyState>
            )}
            <div className="personal-section-note">
              <span>只列出已发现 SpecTrail 配置的仓库。</span>
              <div className="row">
                {p.more && (
                  <Button variant="text" onClick={p.loadMore}>
                    加载更多
                  </Button>
                )}
                <Button
                  variant="text"
                  disabled={!p.connection || p.discovery?.state === "running"}
                  onClick={() => void discover()}
                >
                  重新发现
                </Button>
                <Button
                  variant="text"
                  disabled={!p.connection}
                  onClick={() => setCheck(true)}
                >
                  用仓库地址检查
                </Button>
              </div>
            </div>
            <div className="personal-reading-corner">
              <Card>
                <CardHeader>
                  <CardTitle>协作从仓库开始</CardTitle>
                </CardHeader>
                <CardContent>
                  分享工程记录给协作者，对方用自己的 GitHub
                  连接打开，阅读权限随仓库保持一致。
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>原型可以直接分享</CardTitle>
                </CardHeader>
                <CardContent>
                  准备好的固定版本拥有公开链接，查看原型无需连接 GitHub。
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
      {connect && <ConnectDialog onClose={() => setConnect(false)} />}{" "}
      {check && <RepositoryCheck onClose={() => setCheck(false)} />}
    </>
  );
}
export function Connections() {
  const p = usePersonal(),
    { nav } = useWorkspace();
  const [editing, setEditing] = useState<ConnectionSummary | null | undefined>(
      undefined,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const run = async (id: string, operation: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await operation();
      await p.reloadSession();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="personal-connections">
      <div className="personal-intro">
        <div>
          <div className="eyebrow">YOUR CONNECTIONS</div>
          <h1>我的连接</h1>
          <p>管理自己的读取凭据。每个连接都有独立的访问范围。</p>
        </div>
        <Button variant="primary" onClick={() => setEditing(null)}>
          <Plus data-icon="inline-start" />
          添加连接
        </Button>
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {p.session?.connections.map((c) => (
        <Card className="personal-connection-card" key={c.id}>
          <CardHeader>
            <CardTitle>
              <Github size={18} /> {c.label}
            </CardTitle>
            <CardDescription>
              @{c.identity.login} · GitHub · {c.id.slice(0, 8)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              所有仓库操作使用此连接的 token；替换时仍需属于同一个 GitHub 账号。
            </p>
          </CardContent>
          <CardFooter className="personal-connection-actions">
            <Button
              onClick={() => {
                p.selectConnection(c.id);
                nav({ m: "home" });
              }}
            >
              查看仓库
            </Button>
            <Button onClick={() => setEditing(c)}>替换 token</Button>
            <Button
              disabled={!!busy}
              onClick={() =>
                void run(c.id, () => api("/api/session", { method: "DELETE" }))
              }
            >
              移除连接
            </Button>
          </CardFooter>
        </Card>
      ))}
      {!p.session?.connections.length && (
        <EmptyState title="还没有个人连接">
          <p>添加 GitHub token 后自动发现仓库。</p>
        </EmptyState>
      )}
      <div className="personal-section-note">
        <p>移除连接会清除当前会话的读取权限，已经发布的原型继续公开。</p>
        <Button
          disabled={!!busy || !p.session?.connected}
          onClick={() =>
            void run("logout", () => api("/api/session", { method: "DELETE" }))
          }
        >
          退出工作台
        </Button>
      </div>
      {editing !== undefined && (
        <ConnectDialog
          connection={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}
function PersonalDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const trigger = useRef<HTMLElement | null>(
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement)
      : null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="personal-dialog"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="personal-dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton aria-label="关闭">
                <X />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ConnectDialog({
  connection,
  onClose,
}: {
  connection?: ConnectionSummary;
  onClose: () => void;
}) {
  const p = usePersonal();
  const [token, setToken] = useState(""),
    [username, setUsername] = useState(connection?.identity.login ?? ""),
    [label, setLabel] = useState(connection?.label ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const value = token;
    setToken("");
    try {
      const result = await api<{ connection: ConnectionSummary }>(
        "/api/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: "github",
            username,
            token: value,
            ...(label.trim() ? { label: label.trim() } : {}),
          }),
        },
      );
      await p.reloadSession(result.connection.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const provider = p.session?.providers.find((v) => v.id === "github");
  return (
    <PersonalDialog
      title={connection ? "切换凭据" : "登录工作台"}
      onClose={onClose}
    >
      <p className="muted">
        {connection
          ? "相同 token 恢复原工作台，不同 token 使用独立工作台。失败时保留当前登录。"
          : "使用 Git 用户名与 token，恢复自己的工作台并发现 SpecTrail 仓库。"}
      </p>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="git-username">Git 用户名</FieldLabel>
            <Input
              id="git-username"
              autoFocus
              autoComplete="username"
              value={username}
              maxLength={255}
              required
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="connection-label">连接名称（可选）</FieldLabel>
            <Input
              id="connection-label"
              value={label}
              maxLength={100}
              placeholder="例如：工作仓库"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="github-token">GitHub token</FieldLabel>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              value={token}
              required
              aria-invalid={!!error}
              aria-describedby="token-help"
              onChange={(e) => setToken(e.target.value)}
            />
            <FieldDescription id="token-help">
              只在提交时发送，浏览器不保存 token。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="personal-scope">
          <strong>建议使用 Fine-grained token</strong>
          <p>
            选择需要读取的仓库，授予 Contents: Read-only；Metadata 保持
            Read-only。组织仓库可能需要管理员批准。
          </p>
          <a
            href={
              provider?.tokenUrl ??
              "https://github.com/settings/personal-access-tokens/new"
            }
            target="_blank"
            rel="noreferrer"
          >
            去 GitHub 生成 token ↗
          </a>
        </div>
        {error && (
          <p className="personal-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="personal-dialog-actions">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!token.trim()}
          >
            {connection ? "替换 token" : "连接并发现仓库"}
          </Button>
        </div>
      </form>
    </PersonalDialog>
  );
}
function RepositoryCheck({ onClose }: { onClose: () => void }) {
  const p = usePersonal();
  const { selectRepository } = useWorkspace();
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<DiscoveredRepository | null>(null);
  return (
    <PersonalDialog title="检查仓库接入情况" onClose={onClose}>
      <p className="muted">
        使用当前连接检查仓库权限、SpecTrail 配置及阅读来源。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!p.connection) return;
          setBusy(true);
          setError("");
          setResult(null);
          try {
            const value = await api<DiscoveredRepository>(
              `/api/connections/${p.connection.id}/repository-checks`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
              },
            );
            setResult(value);
            p.reloadDirectory();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="repository-url">
              GitHub HTTPS 仓库地址
            </FieldLabel>
            <Input
              id="repository-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
            />
          </Field>
        </FieldGroup>
        {result && (
          <div className="personal-notice" role="status">
            <strong>
              {
                {
                  ready: "已接入，可以阅读",
                  attention: "已发现配置，需要关注",
                  "not-integrated": "尚未接入 SpecTrail",
                  unavailable: "检查未完成",
                }[result.state]
              }
            </strong>
            <p>{result.message ?? result.repository.fullName}</p>
            {["ready", "attention"].includes(result.state) && (
              <Button
                onClick={() => {
                  selectRepository(result.key, result.repository);
                  onClose();
                }}
              >
                打开仓库
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
        )}
        {error && (
          <p className="personal-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="personal-dialog-actions">
          <Button onClick={onClose}>关闭</Button>
          <Button type="submit" variant="primary" loading={busy}>
            检查仓库
          </Button>
        </div>
      </form>
    </PersonalDialog>
  );
}
