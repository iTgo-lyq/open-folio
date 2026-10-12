"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCw, Link2 } from "lucide-react";
import { Button, Badge, IconButton } from "@open-folio/ui";
import type { PublicPreview } from "@/server/public-previews";
import { DEVICE_VIEWPORTS } from "@/lib/preview-viewport";
const labels = { "pc-web": "PC Web", ipad: "iPad", mobile: "手机" };
export function PublicPreviewView({ meta }: { meta: PublicPreview }) {
  const [device, setDevice] = useState(meta.devices?.[0]),
    [rotated, setRotated] = useState(false),
    [message, setMessage] = useState(""),
    [available, setAvailable] = useState({ width: 1000, height: 700 });
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
      chosen = q.get("device");
    if (meta.devices?.some((d) => d === chosen))
      setDevice(chosen as typeof device);
    setRotated(q.get("orientation") === "landscape");
  }, [meta.devices]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const viewport = meta.viewport ?? DEVICE_VIEWPORTS[device ?? "pc-web"],
    size = rotated
      ? { width: viewport.height, height: viewport.width }
      : viewport,
    scale = Math.min(
      1,
      Math.max(1, available.width - 32) / size.width,
      Math.max(1, available.height - 32) / size.height,
    );
  return (
    <main className="public-preview-page">
      <header>
        <a className="public-preview-brand" href="/">
          <img src="/brand/openfolio-mark.png" alt="" />
          OpenFolio
        </a>
        <h1>{meta.title}</h1>
        <Badge tone="info">公开 · 固定版本</Badge>
        <div className="public-preview-controls">
          {meta.devices && (
            <select
              aria-label="预览设备"
              value={device}
              onChange={(e) => {
                setDevice(e.target.value as typeof device);
                setRotated(false);
              }}
            >
              {meta.devices.map((d) => (
                <option key={d} value={d}>
                  {labels[d]}
                </option>
              ))}
            </select>
          )}
          <IconButton
            aria-label="旋转视口"
            onClick={() => setRotated((v) => !v)}
          >
            <RotateCw />
          </IconButton>
          <Button
            onClick={async () => {
              const link = new URL(window.location.href);
              if (device) link.searchParams.set("device", device);
              link.searchParams.set(
                "orientation",
                rotated ? "landscape" : "portrait",
              );
              try {
                await navigator.clipboard.writeText(link.href);
                setMessage("公开链接已复制");
              } catch {
                setMessage("请从地址栏复制链接");
              }
            }}
          >
            <Link2 data-icon="inline-start" />
            复制链接
          </Button>
        </div>
      </header>
      <div className="public-preview-caption">
        任何人都可以查看这个原型 · {meta.revision.slice(0, 12)}
        {message && <span role="status"> · {message}</span>}
      </div>
      <div className="public-preview-canvas" ref={canvas}>
        <div
          style={{
            width: size.width * scale,
            height: size.height * scale,
            position: "relative",
          }}
        >
          <iframe
            title={meta.title}
            src={
              meta.type === "hosted"
                ? meta.url
                : `/api/public-previews/${meta.id}/index.html`
            }
            width={size.width}
            height={size.height}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              border: 0,
              background: "white",
            }}
          />
        </div>
      </div>
    </main>
  );
}
