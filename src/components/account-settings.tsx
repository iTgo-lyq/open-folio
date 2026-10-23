"use client";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  KeyRound,
  LogOut,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Unlink,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
} from "@open-folio/ui";
import type {
  ConnectionSummary,
  DeviceSummary,
  SessionSummary,
} from "@/server/personal-sessions";
import { api, ApiError } from "./api";
import { usePersonal } from "./personal-context";
import { useWorkspace } from "./context";
import { ConnectDialog, PersonalDialog } from "./personal-forms";
import page from "./personal.module.css";
import styles from "./account-settings.module.css";

export function AccountSettings() {
  const p = usePersonal();
  return <SettingsBody key={`${p.session?.deviceSessionId}:${p.epoch}`} />;
}
function SettingsBody() {
  const p = usePersonal(),
    { notice, errorCode, error: readingError } = useWorkspace();
  const invalidToken = ["TOKEN_INVALID", "IDENTITY_CHANGED"].includes(
    errorCode ?? "",
  );
  const [adding, setAdding] = useState(false),
    [confirming, setConfirming] = useState<
      "logout" | "all" | DeviceSummary | null
    >(null),
    [deviceLoading, setDeviceLoading] = useState(true),
    [deviceRetry, setDeviceRetry] = useState(0),
    [editing, setEditing] = useState<ConnectionSummary | null>(null),
    [label, setLabel] = useState(""),
    [removing, setRemoving] = useState<ConnectionSummary | null>(null),
    [devices, setDevices] = useState<DeviceSummary[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [manual, setManual] = useState("");
  const controller = useRef<AbortController | null>(null),
    copyTrigger = useRef<HTMLElement | null>(null),
    menuTriggers = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => {
      c.abort();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    setDeviceLoading(true);
    const c = new AbortController();
    void api<{ devices: DeviceSummary[] }>("/api/session/devices", {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) {
          setDevices(r.devices);
          setDeviceLoading(false);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setDeviceLoading(false);
        }
      });
    return () => c.abort();
  }, [deviceRetry, p.session?.browserRevision]);
  const run = async (
    name: string,
    operation: (signal: AbortSignal) => Promise<void>,
  ) => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || busy) return;
    setBusy(name);
    setError("");
    notice("");
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
        if (!signal.aborted) notice("Token 已复制");
      } catch {
        if (!signal.aborted) setManual(r.token);
      }
    });
  const confirmAction = () => {
    if (confirming === "logout" || confirming === "all")
      return logout(confirming === "all");
    if (!confirming) return;
    const device = confirming;
    return run(device.id, async (signal) => {
      await api(`/api/session/devices/${device.id}`, {
        method: "DELETE",
        signal,
      });
      if (signal.aborted) return;
      setDevices((current) => current.filter((d) => d.id !== device.id));
      setConfirming(null);
      notice("设备已退出");
    });
  };
  const confirmTitle =
    confirming === "logout"
      ? "退出这台设备？"
      : confirming === "all"
        ? "退出全部设备？"
        : "退出设备？";
  const dialogError = (editing || removing || confirming) && error;
  return (
    <div className={page.page}>
      <div className={`${page.inner} ${styles.inner}`}>
        <header className={page.heading}>
          <h1>账号与 Token</h1>
        </header>
        {p.connectionError && (
          <p role="alert" className={page.error}>
            {p.connectionError}
          </p>
        )}
        {p.restoringConnection && <p role="status">正在恢复已有 Token…</p>}
        {error && !dialogError && (
          <p role="alert" className={page.error}>
            {error}
          </p>
        )}
        <section className={styles.accountCard} aria-label="账号">
          <Avatar name={p.session?.account?.username ?? "?"} size="xl" />
          <span className={styles.stack}>
            <strong>{p.session?.account?.username}</strong>
            <small>OpenFolio 账号</small>
          </span>
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() => setConfirming("logout")}
          >
            退出登录
          </Button>
        </section>
        <section className={styles.section} aria-labelledby="tokens-title">
          <div className={styles.heading}>
            <div>
              <h2 id="tokens-title">Token</h2>
              <p>
                随账号保存。在任何浏览器登录后都可以直接选用，不需要再次输入。
              </p>
            </div>
            <Button size="sm" onClick={() => setAdding(true)} disabled={!!busy}>
              <Plus />
              添加 Token
            </Button>
          </div>
          {invalidToken && (
            <div className={page.banner} role="alert">
              <span>{readingError || "当前 Token 已失效，请重新绑定。"}</span>
              <Button size="sm" onClick={() => setAdding(true)}>
                重新绑定
              </Button>
            </div>
          )}
          {p.session?.connections.length ? (
            <ul className={styles.list} aria-label="已绑定 Token">
              {p.session.connections.map((connection) => {
                const current = connection.id === p.connection?.id;
                const focusMenu = () => {
                  copyTrigger.current =
                    menuTriggers.current.get(connection.id) ?? null;
                };
                return (
                  <li
                    className={styles.row}
                    key={connection.id}
                    aria-label={connection.label}
                  >
                    <KeyRound className={styles.rowIcon} aria-hidden="true" />
                    <span className={styles.stack}>
                      <span className={styles.rowName}>
                        {connection.label}
                        {current && <Badge tone="accent">当前使用</Badge>}
                        {current && invalidToken && (
                          <Badge tone="danger">已失效</Badge>
                        )}
                      </span>
                      <small>
                        {connection.identity.instanceId} · @
                        {connection.identity.login}
                      </small>
                    </span>
                    {!current && (
                      <Button
                        size="sm"
                        disabled={!!busy}
                        loading={busy === connection.id}
                        aria-label={`使用${connection.label}`}
                        onClick={() => void switchTo(connection.id)}
                      >
                        使用
                      </Button>
                    )}
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton
                          ref={(el) => {
                            if (el) menuTriggers.current.set(connection.id, el);
                            else menuTriggers.current.delete(connection.id);
                          }}
                          aria-label={`${connection.label} 的更多操作`}
                          disabled={!!busy}
                        >
                          <MoreHorizontal />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent
                        aria-label="Token 操作"
                        align="end"
                        onCloseAutoFocus={(event) => {
                          if (editing || removing) event.preventDefault();
                        }}
                      >
                        <MenuItem
                          onSelect={() => {
                            focusMenu();
                            setEditing(connection);
                            setLabel(connection.label);
                            setError("");
                          }}
                        >
                          <Pencil />
                          重命名
                        </MenuItem>
                        <MenuItem
                          disabled={!current}
                          onSelect={() => {
                            focusMenu();
                            void copy();
                          }}
                        >
                          <Copy />
                          <span>
                            复制 Token
                            {!current && (
                              <small className={styles.menuHint}>
                                先设为当前使用
                              </small>
                            )}
                          </span>
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          tone="danger"
                          onSelect={() => {
                            focusMenu();
                            setRemoving(connection);
                            setError("");
                          }}
                        >
                          <Unlink />
                          解绑
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <KeyRound />
              <span className={styles.stack}>
                <strong>还没有绑定 Token</strong>
                <small>添加一个 GitHub Token 后才能发现和阅读仓库。</small>
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setAdding(true)}
              >
                添加 Token
              </Button>
            </div>
          )}
        </section>
        <section className={styles.section} aria-labelledby="devices-title">
          <div className={styles.heading}>
            <div>
              <h2 id="devices-title">登录设备</h2>
              <p>退出设备只结束登录，账号的 Token 会保留。</p>
            </div>
          </div>
          {deviceLoading ? (
            <div role="status" aria-label="正在读取登录设备">
              <Skeleton style={{ height: 70 }} />
            </div>
          ) : devices.length ? (
            <ul className={styles.list} aria-label="登录设备">
              {devices.map((device) => (
                <li className={styles.row} key={device.id}>
                  <Monitor className={styles.rowIcon} aria-hidden="true" />
                  <span className={styles.stack}>
                    <span className={styles.rowName}>
                      {device.label}
                      {device.current && <Badge>此设备</Badge>}
                    </span>
                    <small>
                      最近使用：{new Date(device.lastSeenAt).toLocaleString()} ·{" "}
                      {new Date(device.createdAt).toLocaleDateString()} 登录
                    </small>
                  </span>
                  {!device.current && (
                    <Button
                      size="sm"
                      disabled={!!busy}
                      aria-label={`退出设备 ${device.id.slice(0, 8)}`}
                      onClick={() => {
                        setError("");
                        setConfirming(device);
                      }}
                    >
                      退出
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Button
              onClick={() => {
                setError("");
                setDeviceRetry((v) => v + 1);
              }}
            >
              重新读取登录设备
            </Button>
          )}
          <div className={styles.danger}>
            <span className={styles.stack}>
              <strong>退出全部设备</strong>
              <small>包括这台设备。之后需要重新输入账号和密码。</small>
            </span>
            <Button
              size="sm"
              variant="danger"
              disabled={!!busy}
              onClick={() => {
                setError("");
                setConfirming("all");
              }}
            >
              退出全部设备
            </Button>
          </div>
        </section>
      </div>
      {adding && <ConnectDialog onClose={() => setAdding(false)} />}
      {editing && (
        <PersonalDialog
          title="重命名 Token"
          focusTarget={copyTrigger.current}
          onClose={() => {
            setEditing(null);
            copyTrigger.current = null;
            setError("");
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
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
                notice("已重命名");
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
                disabled={!!busy}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            {error && (
              <p className={page.error} role="alert">
                {error}
              </p>
            )}
            <div className={page.dialogActions}>
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button
                type="submit"
                variant="primary"
                loading={busy === "rename"}
              >
                保存
              </Button>
            </div>
          </form>
        </PersonalDialog>
      )}
      {removing && (
        <PersonalDialog
          title="解绑 Token？"
          focusTarget={copyTrigger.current}
          onClose={() => {
            setRemoving(null);
            copyTrigger.current = null;
            setError("");
          }}
        >
          <p className={page.muted}>
            “{removing.label}”将从账号移除，所有设备停止使用此
            Token。之后可以重新添加。
          </p>
          {error && (
            <p className={page.error} role="alert">
              {error}
            </p>
          )}
          <div className={page.dialogActions}>
            <Button onClick={() => setRemoving(null)}>取消</Button>
            <Button
              variant="danger"
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
                  notice("已解绑");
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
          onClose={() => {
            setManual("");
            copyTrigger.current = null;
          }}
        >
          <p className={page.muted}>剪贴板不可用，请选中并复制。</p>
          <Field>
            <FieldLabel htmlFor="manual-token">当前 Token</FieldLabel>
            <Input
              id="manual-token"
              value={manual}
              readOnly
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <div className={page.dialogActions}>
            <Button
              onClick={() => {
                setManual("");
                copyTrigger.current = null;
              }}
            >
              完成
            </Button>
          </div>
        </PersonalDialog>
      )}
      {confirming && (
        <PersonalDialog
          title={confirmTitle}
          onClose={() => {
            setConfirming(null);
            setError("");
          }}
        >
          <p className={page.muted}>
            {typeof confirming === "object"
              ? `${confirming.label} 需要重新登录。`
              : confirming === "all"
                ? "包括这台设备，其他浏览器也需要重新登录。"
                : "账号的 Token 与其他设备不受影响。"}
            账号绑定的 Token 会保留。
          </p>
          {error && (
            <p className={page.error} role="alert">
              {error}
            </p>
          )}
          <div className={page.dialogActions}>
            <Button onClick={() => setConfirming(null)}>取消</Button>
            <Button
              variant="danger"
              loading={!!busy}
              onClick={() => void confirmAction()}
            >
              <LogOut />
              {confirming === "all"
                ? "全部退出"
                : confirming === "logout"
                  ? "退出登录"
                  : "退出"}
            </Button>
          </div>
        </PersonalDialog>
      )}
    </div>
  );
}
