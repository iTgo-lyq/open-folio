"use client";
import { useRef, useState } from "react";
import { Copy, Globe, X } from "lucide-react";
import {
  Button,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import styles from "./share-manager.module.css";
export function PublicLinkPopover({
  url,
  error,
  retry,
  device,
  orientation,
  disabled,
}: {
  url?: string;
  error?: string;
  retry: () => void;
  device?: string;
  orientation?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState(""),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const link = url && origin ? new URL(url, origin) : undefined;
  if (link && device) link.searchParams.set("device", device);
  if (link && orientation) link.searchParams.set("orientation", orientation);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setOrigin(window.location.origin);
        setMessage("");
      }}
    >
      <PopoverTrigger asChild>
        <IconButton aria-label="公开链接" tooltip disabled={disabled}>
          <Globe />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="公开链接"
        className={styles.popover}
      >
        <header>
          <h2>公开链接</h2>
          <IconButton
            aria-label="关闭公开链接"
            size="sm"
            onClick={() => setOpen(false)}
          >
            <X />
          </IconButton>
        </header>
        <p>任何人都能打开这个固定版本。之后更新原型不会改变这个链接的内容。</p>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button size="sm" onClick={retry}>
              重新准备公开链接
            </Button>
          </>
        ) : !link ? (
          <p role="status">正在准备固定版本…</p>
        ) : (
          <>
            <label htmlFor="public-preview-link">公开链接</label>
            <div className={styles.row}>
              <Input
                id="public-preview-link"
                ref={input}
                value={link.href}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <Button
                size="sm"
                variant="primary"
                aria-label="复制公开链接"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link.href);
                    setMessage("公开链接已复制。");
                  } catch {
                    input.current?.focus();
                    input.current?.select();
                    setMessage("已选中链接，请手动复制。");
                  }
                }}
              >
                <Copy />
                复制
              </Button>
            </div>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              打开公开页
            </a>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </PopoverContent>
    </Popover>
  );
}
