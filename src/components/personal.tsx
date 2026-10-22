"use client";
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
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
  Field,
  FieldLabel,
  Input,
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
import { ErrorNotice } from "./document";
import { AccountLogin } from "./account-login";
import { ConnectDialog, PersonalDialog } from "./personal-forms";
export { PersonalHome } from "./personal-home";
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
          添加 Token
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
