"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import {
  Button,
  Field,
  FieldLabel,
  FieldDescription,
  Input,
} from "@open-folio/ui";
import { api } from "./context";

export function AccessForm({
  project,
  name,
  onSuccess,
}: {
  project?: string;
  name?: string;
  onSuccess: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = project === undefined;
  return (
    <form
      className="access-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await api("/api/access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret, ...(admin ? {} : { project }) }),
          });
          setSecret("");
          onSuccess();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <LockKeyhole size={28} aria-hidden="true" />
      <div>
        <h2>{admin ? "管理员登录" : `访问${name ? ` ${name}` : "项目"}`}</h2>
        <p>
          {admin
            ? "输入管理密码，维护项目、邀请码和读取限制。"
            : "输入项目邀请码，此浏览器将记住访问权限。"}
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor={admin ? "admin-secret" : "project-secret"}>
          {admin ? "管理密码" : "项目邀请码"}
        </FieldLabel>
        <Input
          id={admin ? "admin-secret" : "project-secret"}
          type="password"
          autoComplete={admin ? "current-password" : "off"}
          required
          maxLength={admin ? 1024 : 256}
          value={secret}
          disabled={busy}
          onChange={(e) => setSecret(e.target.value)}
          aria-describedby={admin ? "admin-secret-help" : "project-secret-help"}
        />
        <FieldDescription
          id={admin ? "admin-secret-help" : "project-secret-help"}
        >
          {admin
            ? "首次部署的管理密码由部署者提供。"
            : "邀请码由项目管理员提供，或直接打开分享链接。"}
        </FieldDescription>
      </Field>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy}>
        {admin ? "登录管理" : "进入项目"}
      </Button>
    </form>
  );
}
