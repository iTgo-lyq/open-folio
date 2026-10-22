"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrandMark,
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
} from "@open-folio/ui";
import { usePersonal } from "./personal-context";
import { api } from "./api";
import styles from "./personal.module.css";

export function AccountLogin() {
  const p = usePersonal();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const registering = mode === "register";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !username.trim() ||
      [...username.trim()].length > 64 ||
      /\p{Cc}/u.test(username.trim())
    ) {
      setError("账号为 1–64 个字符，不能包含控制字符。");
      return;
    }
    if ([...password].length < 8 || [...password].length > 128) {
      setError("密码为 8–128 个字符。");
      return;
    }
    if (registering && password !== confirm) {
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
      await api(registering ? "/api/accounts/register" : "/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: value }),
        signal: c.signal,
      });
      if (!c.signal.aborted) await p.reloadSession();
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  return (
    <main
      className={styles.auth}
      id="main"
      style={{ colorScheme: "var(--of-color-scheme)" }}
    >
      <section className={styles.authCard} aria-labelledby="auth-title">
        <BrandMark size={34} label="OpenFolio" />
        <h1 id="auth-title">
          {registering ? "创建 OpenFolio 账号" : "登录 OpenFolio"}
        </h1>
        <p>
          {registering
            ? "账号和密码由你自己设置，登录后再绑定 GitHub Token。"
            : "阅读你参与的项目：Specs、Changes 与原型。"}
        </p>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="account-username">账号</FieldLabel>
              <Input
                id="account-username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                required
                maxLength={128}
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={error ? "account-error" : undefined}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="account-password">密码</FieldLabel>
              <Input
                id="account-password"
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                value={password}
                required
                maxLength={256}
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={
                  error
                    ? "account-error"
                    : registering
                      ? "account-password-help"
                      : undefined
                }
                onChange={(e) => setPassword(e.target.value)}
              />
              {registering && (
                <FieldDescription id="account-password-help">
                  8–128 个字符。
                </FieldDescription>
              )}
            </Field>
            {registering && (
              <Field>
                <FieldLabel htmlFor="account-confirm">确认密码</FieldLabel>
                <Input
                  id="account-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  required
                  maxLength={256}
                  disabled={busy}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
            )}
          </FieldGroup>
          {(error || p.sessionError) && (
            <p id="account-error" className={styles.error} role="alert">
              {error || p.sessionError}
            </p>
          )}
          <Button
            className={styles.authSubmit}
            type="submit"
            variant="primary"
            loading={busy}
          >
            {registering ? "注册并登录" : "登录"}
          </Button>
        </form>
        <div className={styles.authSwitch}>
          {registering ? "已有账号？" : "还没有账号？"}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(registering ? "login" : "register");
              setPassword("");
              setConfirm("");
              setError("");
            }}
          >
            {registering ? "登录" : "注册"}
          </button>
        </div>
      </section>
    </main>
  );
}
