"use client";
import { useId, useRef, useState } from "react";
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
import { agentSharePath, sharePath } from "@/lib/share-link";
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
          aria-describedby={`${id}-description`}
          onFocus={(event) => event.target.select()}
        />
        <Button
          size="sm"
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
  const { repository, data } = useWorkspace();
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState("");
  const target = {
    repository: repository?.webUrl ?? "",
    change: changeId,
    integrationBranch: data?.integrationBranch ?? undefined,
  };
  const path = sharePath(target);
  const agentPath = agentSharePath(target);
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
          两种链接都无需登录，分享范围相同，内容随已推送版本更新。
        </p>
        <FieldGroup className={styles.links}>
          <ShareLinkField
            key={path}
            label="网页链接"
            description="适合在浏览器中阅读这个 Change。"
            copyLabel="复制网页链接"
            url={origin + path}
          />
          <ShareLinkField
            key={agentPath}
            label="Agent 文本链接"
            description="将链接发给 Agent，直接读取 Markdown 内容。"
            copyLabel="复制 Agent 链接"
            url={origin + agentPath}
          />
        </FieldGroup>
        <a href={path} target="_blank" rel="noopener noreferrer">
          打开分享页
        </a>
      </PopoverContent>
    </Popover>
  );
}
