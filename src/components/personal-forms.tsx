"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
} from "@open-folio/ui";
import { SUGGESTED_INTEGRATION_BRANCH } from "@/lib/collaboration";
import type { ConnectionSummary } from "@/server/personal-sessions";
import type { DiscoveredRepository } from "@/server/discovery";
import { api, ApiError } from "./api";
import { usePersonal } from "./personal-context";
import { useWorkspace } from "./context";
import styles from "./personal.module.css";

export function PersonalDialog({
  title,
  children,
  onClose,
  focusTarget,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  focusTarget?: HTMLElement | null;
}) {
  const trigger = useRef(
    focusTarget ??
      (typeof document !== "undefined"
        ? (document.activeElement as HTMLElement)
        : null),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div className={styles.dialogHeading}>
          <DialogTitle>{title}</DialogTitle>
          <IconButton aria-label="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        {children}
      </DialogContent>
    </Dialog>
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
    if (busy) return;
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
    <PersonalDialog title="添加 Token" onClose={onClose}>
      <p className={styles.muted}>Token 随账号保存；此浏览器将使用新绑定。</p>
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
              disabled={busy}
              placeholder="例如：工作项目"
              aria-describedby="username-help"
              onChange={(e) => setLabel(e.target.value)}
            />
            <FieldDescription id="username-help">
              留空时使用平台账号名。
            </FieldDescription>
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="github-token">GitHub Token</FieldLabel>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              disabled={busy}
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
        <div className={styles.scope}>
          <strong>建议使用 Fine-grained token</strong>
          <p>
            选择需要读取的仓库，授予 Contents 与 Pull requests:
            Read-only；Metadata 保持 Read-only。组织仓库可能需要管理员批准。
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
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!token.trim()}
          >
            验证并添加
          </Button>
        </div>
      </form>
    </PersonalDialog>
  );
}
export function RepositoryCheck({
  onClose,
  item,
}: {
  onClose: () => void;
  item?: DiscoveredRepository;
}) {
  const p = usePersonal();
  const { selectRepository } = useWorkspace();
  const [url, setUrl] = useState(item?.repository.webUrl ?? ""),
    [integrationBranch, setCollaborationBranch] = useState(
      item?.integrationBranch ?? SUGGESTED_INTEGRATION_BRANCH,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<DiscoveredRepository | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <PersonalDialog title="添加仓库" onClose={onClose}>
      <p className={styles.muted}>
        使用当前连接检查仓库权限、SpecTrail 配置及阅读来源。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!p.connection || busy) return;
          const c = new AbortController();
          controller.current = c;
          setBusy(true);
          setError("");
          setResult(null);
          try {
            const value = await api<DiscoveredRepository>(
              `/api/connections/${p.connection.id}/repository-checks`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, integrationBranch }),
                signal: c.signal,
              },
            );
            if (c.signal.aborted) return;
            setResult(value);
            p.reloadDirectory();
          } catch (e) {
            if (!c.signal.aborted) setError((e as Error).message);
          } finally {
            if (!c.signal.aborted) setBusy(false);
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
              autoFocus
              disabled={busy}
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
            <FieldLabel htmlFor="collaboration-branch">集成分支</FieldLabel>
            <Input
              id="collaboration-branch"
              disabled={busy}
              required
              value={integrationBranch}
              onChange={(e) => {
                setCollaborationBranch(e.target.value);
                setResult(null);
              }}
            />
            <FieldDescription>
              填写项目实际使用的集成分支，推荐名称为 develop。
            </FieldDescription>
          </Field>
        </FieldGroup>
        {result && (
          <div className={styles.checkResult} role="status">
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
                    result.integrationBranch,
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
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button onClick={onClose}>关闭</Button>
          <Button type="submit" variant="primary" loading={busy}>
            检查仓库
          </Button>
        </div>
      </form>
    </PersonalDialog>
  );
}
