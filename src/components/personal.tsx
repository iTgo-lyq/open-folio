"use client";
import { SUGGESTED_COLLABORATION_BRANCH } from "@/lib/collaboration";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import {
  ArrowRight,
  Copy,
  ChevronRight,
  GitBranch,
  KeyRound,
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
import { api, ApiError } from "./api";
import type {
  ConnectionSummary,
  DeviceSummary,
  SessionSummary,
} from "@/server/personal-sessions";
import type { DiscoveredRepository } from "@/server/discovery";
import { ErrorNotice } from "./document";
export function ConnectionPicker() {
  const { connection } = usePersonal();
  return connection ? (
    <span className="personal-current-account">
      @{connection.identity.login}
      {connection.label !== connection.identity.login &&
        ` · ${connection.label}`}
    </span>
  ) : null;
}
export function PersonalHome() {
  const p = usePersonal(),
    { nav, selectRepository } = useWorkspace();
  const [connect, setConnect] = useState(false),
    [check, setCheck] = useState(false),
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
  const items = p.items.filter((i) => filter === "all" || i.state === filter);

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
  if (!p.session.authenticated) return <AccountLogin />;
  if (!p.session.connected) return <Connections />;
  return (
    <>
      <section
        className={p.session.connected ? "personal-home" : "personal-welcome"}
      >
        <>
          <div className="personal-intro">
            <div>
              <div className="eyebrow">YOUR WORKBENCH</div>
              <h1>我的仓库</h1>
              <p>把正在参与的工程，放回清晰的上下文。</p>
            </div>
            <Button onClick={() => nav({ m: "connections" })}>
              <KeyRound data-icon="inline-start" />
              当前凭据
            </Button>
          </div>
          <div className="personal-connection-context">
            <ConnectionPicker />
            <span className="muted">使用当前 token 的读取权限</span>
          </div>
          {(failure || p.directoryError) && (
            <ErrorNotice>
              {failure || p.directoryError}
              <Button variant="text" onClick={() => void discover()}>
                重试发现
              </Button>
              <Button variant="text" onClick={() => nav({ m: "connections" })}>
                切换凭据
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
                  href={`?${new URLSearchParams({ repo: item.key, m: "specs", provider: item.repository.providerId, instance: item.repository.instanceId, repositoryId: item.repository.repositoryId, fullName: item.repository.fullName, collaborationBranch: item.collaborationBranch })}`}
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
                    <GitBranch size={13} /> {item.collaborationBranch}
                  </span>
                  <Badge tone={item.state === "ready" ? "success" : "warning"}>
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
                  : filter !== "all"
                    ? "没有匹配的仓库"
                    : p.discovery?.state === "complete"
                      ? "还没有发现 SpecTrail 仓库"
                      : "仓库检查尚未完成"
              }
            >
              <p>
                {p.discovery?.state === "complete"
                  ? "确认 token 已选择目标仓库，并具有 Contents 只读权限。协作分支需要有效的 SpecTrail 配置；自定义名称可通过仓库地址检查指定。"
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
                分享工程记录给协作者，对方登录并绑定 Token
                后打开，阅读权限随仓库保持一致。
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>原型可以直接分享</CardTitle>
              </CardHeader>
              <CardContent>
                准备好的固定版本拥有公开链接，查看原型无需登录。
              </CardContent>
            </Card>
          </div>
        </>
      </section>
      {connect && <ConnectDialog onClose={() => setConnect(false)} />}{" "}
      {check && <RepositoryCheck onClose={() => setCheck(false)} />}
    </>
  );
}
export function AccountLogin() {
  const p = usePersonal();
  const [mode, setMode] = useState("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "register" && password !== confirm) {
      setError("两次密码不一致。");
      return;
    }
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    const value = password;
    setPassword("");
    setConfirm("");
    try {
      await api(
        mode === "register" ? "/api/accounts/register" : "/api/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: value }),
          signal: c.signal,
        },
      );
      if (!c.signal.aborted) await p.reloadSession();
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="personal-auth">
      <div className="personal-auth-heading">
        <img src="/brand/openfolio-mark.png" alt="" />
        <h1>你的工程工作台</h1>
        <p>登录后，在不同浏览器恢复已绑定的 Token。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {mode === "login" ? "登录账号" : "创建账号"}
          </CardTitle>
          <CardDescription>账号和密码由你自己设置。</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value);
              setPassword("");
              setConfirm("");
              setError("");
            }}
          >
            <TabsList aria-label="账号入口">
              <TabsTrigger value="login" disabled={busy}>
                登录
              </TabsTrigger>
              <TabsTrigger value="register" disabled={busy}>
                注册
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="account-username">账号</FieldLabel>
                <Input
                  id="account-username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  required
                  maxLength={64}
                  disabled={busy}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="account-password">密码</FieldLabel>
                <Input
                  id="account-password"
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={busy}
                  aria-invalid={!!error}
                  aria-describedby="account-password-help"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <FieldDescription id="account-password-help">
                  8–128 个字符。
                </FieldDescription>
              </Field>
              {mode === "register" && (
                <Field>
                  <FieldLabel htmlFor="account-confirm">确认密码</FieldLabel>
                  <Input
                    id="account-confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={busy}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              )}
            </FieldGroup>
            {(error || p.sessionError) && (
              <p role="alert" className="personal-form-error">
                {error || p.sessionError}
              </p>
            )}
            <Button type="submit" variant="primary" loading={busy}>
              {mode === "login" ? "登录" : "创建并登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
export function Connections() {
  const p = usePersonal();
  if (!p.session)
    return (
      <EmptyState
        title={p.sessionError || "正在恢复账号…"}
        action={<Button onClick={() => void p.reloadSession()}>重试</Button>}
      />
    );
  if (!p.session.authenticated) return <AccountLogin />;
  return <AccountCredentials key={`${p.session.deviceSessionId}:${p.epoch}`} />;
}
function AccountCredentials() {
  const p = usePersonal(),
    { nav } = useWorkspace();
  const [tab, setTab] = useState("tokens"),
    [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<ConnectionSummary | null>(null),
    [label, setLabel] = useState(""),
    [removing, setRemoving] = useState<ConnectionSummary | null>(null),
    [devices, setDevices] = useState<DeviceSummary[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [manual, setManual] = useState("");
  const controller = useRef<AbortController | null>(null),
    copyTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => {
      c.abort();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    if (tab !== "devices") return;
    const c = new AbortController();
    void api<{ devices: DeviceSummary[] }>("/api/session/devices", {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setDevices(r.devices);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [tab, p.session?.browserRevision]);
  const run = async (
    name: string,
    operation: (signal: AbortSignal) => Promise<void>,
  ) => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    setBusy(name);
    setError("");
    setStatus("");
    setManual("");
    try {
      await operation(signal);
    } catch (e) {
      if (!signal.aborted) {
        setError((e as Error).message);
        if (
          e instanceof ApiError &&
          [
            "SESSION_CHANGED",
            "SESSION_REQUIRED",
            "CONNECTION_NOT_FOUND",
          ].includes(e.code)
        )
          await p.reloadSession(undefined, true);
      }
    } finally {
      if (!signal.aborted) setBusy("");
    }
  };
  const refresh = async (session: SessionSummary) =>
    p.reloadSession(
      undefined,
      session.deviceSessionId === p.session?.deviceSessionId &&
        session.selectionRevision === p.session?.selectionRevision,
    );
  const switchTo = (id: string) =>
    run(id, async (signal) => {
      await api("/api/session/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
        signal,
      });
      if (!signal.aborted) await p.reloadSession();
    });
  const logout = (all = false) =>
    run("logout", async (signal) => {
      await api(all ? "/api/session/logout-all" : "/api/session", {
        method: all ? "POST" : "DELETE",
        signal,
      });
      if (!signal.aborted) await p.reloadSession();
    });
  const copy = () =>
    run("copy", async (signal) => {
      const r = await api<{ token: string }>("/api/session/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal,
      });
      if (signal.aborted) return;
      try {
        await navigator.clipboard.writeText(r.token);
        if (!signal.aborted) setStatus("Token 已复制");
      } catch {
        if (!signal.aborted) setManual(r.token);
      }
    });
  return (
    <section className="personal-connections">
      <div className="personal-intro">
        <div>
          <div className="eyebrow">YOUR ACCOUNT</div>
          <h1>Token 管理</h1>
          <p>
            {p.session?.account?.username} ·
            绑定随账号保存，当前选择仅用于此浏览器。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setAdding(true)}
          disabled={!!busy}
        >
          绑定 Token
        </Button>
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {status && <p role="status">{status}</p>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="账号管理">
          <TabsTrigger value="tokens">已绑定 Token</TabsTrigger>
          <TabsTrigger value="devices">登录设备</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "tokens" ? (
        <Card>
          <CardHeader>
            <CardTitle>已绑定 Token</CardTitle>
            <CardDescription>
              在其他浏览器登录同一账号即可使用。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!p.session?.connections.length && (
              <EmptyState title="还没有绑定 Token">
                <p>添加 GitHub Token，开始发现仓库。</p>
                <Button onClick={() => setAdding(true)}>绑定首个 Token</Button>
              </EmptyState>
            )}
            {p.session?.connections.map((connection) => {
              const current = connection.id === p.connection?.id;
              return (
                <div className="personal-identity-row" key={connection.id}>
                  <div className="personal-identity-name">
                    <strong>{connection.label}</strong>
                    <p className="muted">
                      @{connection.identity.login} ·{" "}
                      {connection.identity.instanceId}
                    </p>
                  </div>
                  {current && <Badge>当前使用</Badge>}
                  <div className="personal-identity-actions">
                    <Button
                      disabled={current || !!busy}
                      loading={busy === connection.id}
                      aria-label={`使用${connection.label}`}
                      onClick={() => void switchTo(connection.id)}
                    >
                      {current ? "正在使用" : "使用"}
                    </Button>
                    <Button
                      variant="text"
                      disabled={!!busy}
                      aria-label={`命名${connection.label}`}
                      onClick={() => {
                        setEditing(connection);
                        setLabel(connection.label);
                      }}
                    >
                      命名
                    </Button>
                    <Button
                      variant="text"
                      disabled={!!busy}
                      aria-label={`解绑${connection.label}`}
                      onClick={() => setRemoving(connection)}
                    >
                      解绑
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
          {p.connection && (
            <CardFooter className="personal-connection-actions">
              <Button onClick={() => nav({ m: "home" })}>查看仓库</Button>
              <Button
                disabled={!!busy}
                onClick={(e) => {
                  copyTrigger.current = e.currentTarget;
                  void copy();
                }}
              >
                <Copy data-icon="inline-start" />
                复制当前 Token
              </Button>
            </CardFooter>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>登录设备</CardTitle>
            <CardDescription>退出设备保留账号已绑定的 Token。</CardDescription>
          </CardHeader>
          <CardContent>
            {devices.map((device) => (
              <div className="personal-device-row" key={device.id}>
                <div>
                  <strong>
                    {device.label} · {device.id.slice(0, 8)}
                  </strong>{" "}
                  {device.current && <Badge>当前设备</Badge>}
                  <p className="muted">
                    最近使用：{new Date(device.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!device.current && (
                  <Button
                    disabled={!!busy}
                    aria-label={`退出设备 ${device.id.slice(0, 8)}`}
                    onClick={() =>
                      void run(device.id, async (signal) => {
                        await api(`/api/session/devices/${device.id}`, {
                          method: "DELETE",
                          signal,
                        });
                        if (signal.aborted) return;
                        const result = await api<{ devices: DeviceSummary[] }>(
                          "/api/session/devices",
                          { signal },
                        );
                        if (!signal.aborted) setDevices(result.devices);
                      })
                    }
                  >
                    退出设备
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
          <CardFooter className="personal-connection-actions">
            <Button disabled={!!busy} onClick={() => void logout()}>
              退出当前设备
            </Button>
            <Button disabled={!!busy} onClick={() => void logout(true)}>
              退出全部设备
            </Button>
          </CardFooter>
        </Card>
      )}
      {adding && <ConnectDialog onClose={() => setAdding(false)} />}
      {editing && (
        <PersonalDialog title="命名 Token" onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("rename", async (signal) => {
                const result = await api<{ session: SessionSummary }>(
                  `/api/connections/${editing.id}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label }),
                    signal,
                  },
                );
                if (signal.aborted) return;
                setEditing(null);
                await refresh(result.session);
              });
            }}
          >
            <Field>
              <FieldLabel htmlFor="binding-label">名称</FieldLabel>
              <Input
                id="binding-label"
                autoFocus
                maxLength={100}
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            {error && <p role="alert">{error}</p>}
            <div className="personal-dialog-actions">
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button
                type="submit"
                loading={busy === "rename"}
                variant="primary"
              >
                保存名称
              </Button>
            </div>
          </form>
        </PersonalDialog>
      )}
      {removing && (
        <PersonalDialog title="解绑 Token？" onClose={() => setRemoving(null)}>
          <p>
            “{removing.label}”将从账号移除。所有设备停止使用此
            Token，重新使用需再次绑定。
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="personal-dialog-actions">
            <Button onClick={() => setRemoving(null)}>取消</Button>
            <Button
              variant="primary"
              loading={busy === "unbind"}
              onClick={() =>
                void run("unbind", async (signal) => {
                  const result = await api<{ session: SessionSummary }>(
                    `/api/connections/${removing.id}`,
                    { method: "DELETE", signal },
                  );
                  if (signal.aborted) return;
                  setRemoving(null);
                  await refresh(result.session);
                })
              }
            >
              确认解绑
            </Button>
          </div>
        </PersonalDialog>
      )}
      {manual && (
        <PersonalDialog
          title="手动复制 Token"
          focusTarget={copyTrigger.current}
          onClose={() => setManual("")}
        >
          <p>剪贴板不可用，请选中并复制。</p>
          <Field>
            <FieldLabel htmlFor="manual-token">当前 Token</FieldLabel>
            <Input
              id="manual-token"
              value={manual}
              readOnly
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          <Button onClick={() => setManual("")}>完成</Button>
        </PersonalDialog>
      )}
    </section>
  );
}
function PersonalDialog({
  title,
  children,
  onClose,
  focusTarget,
}: {
  title: string;
  focusTarget?: HTMLElement | null;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const trigger = useRef<HTMLElement | null>(
    focusTarget ??
      (typeof document !== "undefined"
        ? (document.activeElement as HTMLElement)
        : null),
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
export function ConnectDialog({ onClose }: { onClose: () => void }) {
  const p = usePersonal();
  const [token, setToken] = useState(""),
    [label, setLabel] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    const value = token;
    setToken("");
    try {
      const result = await api<{ connection: ConnectionSummary }>(
        "/api/connections",
        {
          method: "POST",
          signal: c.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: "github",
            ...(label.trim() ? { label: label.trim() } : {}),
            token: value,
          }),
        },
      );
      if (c.signal.aborted) return;
      await p.reloadSession(result.connection.id);
      onClose();
    } catch (e) {
      if (!c.signal.aborted) {
        setError((e as Error).message);
        if (
          e instanceof ApiError &&
          ["SESSION_CHANGED", "SESSION_REQUIRED"].includes(e.code)
        )
          await p.reloadSession(undefined, true);
      }
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  const provider = p.session?.providers.find((v) => v.id === "github");
  return (
    <PersonalDialog title="绑定 Token" onClose={onClose}>
      <p className="muted">Token 随账号保存；此浏览器将使用新绑定。</p>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="binding-name">名称（可选）</FieldLabel>
            <Input
              id="binding-name"
              autoFocus
              autoComplete="off"
              value={label}
              maxLength={100}
              placeholder="例如：工作项目"
              aria-describedby="username-help"
              onChange={(e) => setLabel(e.target.value)}
            />
            <FieldDescription id="username-help">
              留空时使用平台账号名。
            </FieldDescription>
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
            绑定并使用
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
    [collaborationBranch, setCollaborationBranch] = useState(
      SUGGESTED_COLLABORATION_BRANCH,
    ),
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
                body: JSON.stringify({ url, collaborationBranch }),
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
              onChange={(e) => {
                setUrl(e.target.value);
                setResult(null);
              }}
              placeholder="https://github.com/owner/repository"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="collaboration-branch">协作分支</FieldLabel>
            <Input
              id="collaboration-branch"
              required
              value={collaborationBranch}
              onChange={(e) => {
                setCollaborationBranch(e.target.value);
                setResult(null);
              }}
            />
            <FieldDescription>
              填写项目实际使用的协作分支，推荐名称为 develop。
            </FieldDescription>
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
                  selectRepository(
                    result.key,
                    result.repository,
                    result.collaborationBranch,
                  );
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
