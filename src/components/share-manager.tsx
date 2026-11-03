"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Copy, Share2, X } from "lucide-react";
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import { useWorkspace } from "./context";
import { shareLocation, shareParams, sharedReadUrl } from "@/lib/share-link";
import { api } from "./api";
import styles from "./share-manager.module.css";

function ShareLinkField({
  label,
  description,
  copyLabel,
  url,
}: {
  label: string;
  description: string;
  copyLabel: string;
  url: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  return (
    <Field className={styles.linkField} aria-labelledby={`${id}-label`}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <FieldDescription
        id={`${id}-description`}
        className={styles.linkDescription}
      >
        {description}
      </FieldDescription>
      <div className={styles.row}>
        <Input
          id={id}
          ref={input}
          readOnly
          value={url}
          placeholder="正在生成短链接…"
          aria-describedby={`${id}-description`}
          onFocus={(event) => event.target.select()}
        />
        <Button
          size="sm"
          disabled={!url}
          onClick={async () => {
            setMessage("");
            try {
              await navigator.clipboard.writeText(url);
              setMessage(`${label}已复制。`);
            } catch {
              input.current?.focus();
              input.current?.select();
              setMessage(`已选中${label}，请手动复制。`);
            }
          }}
        >
          <Copy aria-hidden="true" />
          {copyLabel}
        </Button>
      </div>
      <p className={styles.feedback} role="status" aria-atomic="true">
        {message}
      </p>
    </Field>
  );
}

export function ShareManager({ changeId }: { changeId: string }) {
  const { repository, data, q } = useWorkspace();
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState("");
  const [links, setLinks] = useState<{
    key: string;
    web: string;
    agent: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const target = {
    repository: repository?.webUrl ?? "",
    change: changeId,
    integrationBranch: data?.integrationBranch ?? undefined,
  };
  const location = new URLSearchParams(Object.entries(shareLocation(q)));
  const key = `${shareParams(target)}&${location}`;
  useEffect(() => {
    if (!open || links?.key === key) return;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("短链接生成超时，请重试。")),
      15_000,
    );
    let cancelled = false;
    setError("");
    void api<{ web: string; agent: string }>(
      sharedReadUrl(target, `links?${location}`),
      {
        signal: controller.signal,
      },
    )
      .then((value) => {
        if (!cancelled) setLinks({ key, ...value });
      })
      .catch((cause) => {
        if (!cancelled) setError((cause as Error).message);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, key, attempt]);
  const path = links?.key === key ? links.web : "";
  const agentPath = links?.key === key ? links.agent : "";
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setOrigin(window.location.origin);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label="分享" disabled={!repository}>
          <Share2 />
          <span className={styles.triggerText}>分享</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="分享这个 Change"
        align="end"
        className={styles.popover}
      >
        <header>
          <h2>分享这个 Change</h2>
          <IconButton
            aria-label="关闭分享链接"
            size="sm"
            onClick={() => setOpen(false)}
          >
            <X />
          </IconButton>
        </header>
        <p className={styles.description}>
          链接保留当前阅读位置，长期有效，内容随已推送版本更新。
        </p>
        {error && (
          <p role="alert">
            {error}{" "}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </Button>
          </p>
        )}
        <FieldGroup className={styles.links}>
          <ShareLinkField
            key={`web:${path}`}
            label="网页链接"
            description="适合在浏览器中阅读这个 Change。"
            copyLabel="复制网页链接"
            url={path ? origin + path : ""}
          />
          <ShareLinkField
            key={`agent:${agentPath}`}
            label="Agent 文本链接"
            description="将链接发给 Agent，直接读取 Markdown 内容。"
            copyLabel="复制 Agent 链接"
            url={agentPath ? origin + agentPath : ""}
          />
        </FieldGroup>
        {path && (
          <a href={path} target="_blank" rel="noopener noreferrer">
            打开分享页
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
