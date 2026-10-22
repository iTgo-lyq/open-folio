"use client";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Copy, Share2, X } from "lucide-react";
import { useWorkspace } from "./context";
import { sharePath } from "@/lib/share-link";

export function ShareManager({ changeId }: { changeId: string }) {
  const { repository, data } = useWorkspace();
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const path = sharePath({
    repository: repository?.webUrl ?? "",
    change: changeId,
    integrationBranch: data?.integrationBranch ?? undefined,
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setOrigin(window.location.origin);
        setMessage("");
      }}
    >
      <Dialog.Trigger className="text-button" disabled={!repository}>
        <Share2 size={14} />
        分享
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="share-manager"
          aria-describedby="share-description"
        >
          <header>
            <Dialog.Title>分享这个 Change</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭分享链接">
              <X size={18} />
            </Dialog.Close>
          </header>
          <Dialog.Description id="share-description">
            持有链接的人无需登录或配置 Token，即可只读查看这个 Change
            的全部详情。内容自动跟随已推送版本。
          </Dialog.Description>
          <label htmlFor="change-share-link">分享链接</label>
          <div className="share-link-row">
            <input
              id="change-share-link"
              ref={input}
              readOnly
              value={origin + path}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="button"
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
              <Copy size={14} />
              复制
            </button>
          </div>
          <a href={path} target="_blank" rel="noopener noreferrer">
            打开阅读页
          </a>
          {message && <p role="status">{message}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
