"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Copy, Share2, X } from "lucide-react";
import { api, useWorkspace } from "./context";

type Share = { id: string; path: string; createdAt: string };
export function ShareManager({
  changeId,
  externalPreviews,
}: {
  changeId: string;
  externalPreviews: boolean;
}) {
  const { readUrl } = useWorkspace();
  const [open, setOpen] = useState(false),
    [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const endpoint = readUrl(`changes/${encodeURIComponent(changeId)}/share`);
  useEffect(() => {
    if (!open) return;
    setOrigin(window.location.origin);
    setError("");
    setMessage("");
    setShare(null);
    setBusy(true);
    const controller = new AbortController();
    api<{ share: Share | null }>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setShare(value.share);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [open, endpoint]);
  const act = async (revoke: boolean) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (revoke && share) {
        await api(`/api/shares/${share.id}`, { method: "DELETE" });
        setShare(null);
        setMessage("已停止分享，旧链接已失效。");
      } else {
        const result = await api<{ share: Share }>(endpoint, {
          method: "POST",
        });
        setShare(result.share);
        setMessage("分享已开启。");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="text-button">
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
            <Dialog.Close className="icon-button" aria-label="关闭分享管理">
              <X size={18} />
            </Dialog.Close>
          </header>
          <Dialog.Description id="share-description">
            持有链接的人无需配置 Token，即可只读查看这个 Change
            的全部详情。内容自动跟随已推送版本。
          </Dialog.Description>
          {share && (
            <>
              <label htmlFor="change-share-link">分享链接</label>
              <div className="share-link-row">
                <input
                  id="change-share-link"
                  ref={input}
                  readOnly
                  value={origin + share.path}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="button"
                  aria-label="复制分享链接"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(origin + share.path);
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
              <a href={share.path} target="_blank" rel="noopener noreferrer">
                打开阅读页
              </a>
            </>
          )}
          <p className="subtle-note">
            停止分享后旧链接失效，再次分享会生成新链接。
          </p>
          {externalPreviews && (
            <p className="subtle-note">
              已独立公开的原型及已下载内容不会随此链接撤回。
            </p>
          )}
          {error && (
            <p role="alert" className="error-notice">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <footer>
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(!!share)}
            >
              {busy ? "正在处理…" : share ? "停止分享" : "开启分享"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
