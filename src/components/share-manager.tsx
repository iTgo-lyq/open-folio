"use client";
import { useRef, useState } from "react";
import { Copy, Share2, X } from "lucide-react";
import {
  Button,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import { useWorkspace } from "./context";
import { sharePath } from "@/lib/share-link";
import styles from "./share-manager.module.css";
export function ShareManager({ changeId }: { changeId: string }) {
  const { repository, data } = useWorkspace();
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState(""),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const path = sharePath({
    repository: repository?.webUrl ?? "",
    change: changeId,
    integrationBranch: data?.integrationBranch ?? undefined,
  });
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
        <p>
          持有链接的人无需登录即可阅读这个 Change
          的全部详情，内容随已推送版本更新。
        </p>
        <label htmlFor="change-share-link">分享链接</label>
        <div className={styles.row}>
          <Input
            id="change-share-link"
            ref={input}
            readOnly
            value={origin + path}
            onFocus={(event) => event.target.select()}
          />
          <Button
            size="sm"
            variant="primary"
            aria-label="复制分享链接"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(origin + path);
                setMessage("分享链接已复制。");
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
        <a href={path} target="_blank" rel="noopener noreferrer">
          打开分享页
        </a>
        {message && <p role="status">{message}</p>}
      </PopoverContent>
    </Popover>
  );
}
