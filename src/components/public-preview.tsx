"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor, Tablet, Smartphone, RotateCw, RefreshCw } from "lucide-react";
import { IconButton, SegmentedControl } from "@open-folio/ui";
import type { PublicPreview } from "@/server/public-previews";
import { DEVICE_VIEWPORTS } from "@/lib/preview-viewport";
import { PublicShell } from "./public-shell";
import { PrototypeFrame } from "./prototype-frame";
import { Empty } from "./document";
import { useMediaQuery } from "./use-media";
import styles from "./public-preview.module.css";
const devices = {
  "pc-web": { label: "PC Web", icon: Monitor },
  ipad: { label: "iPad", icon: Tablet },
  mobile: { label: "移动设备", icon: Smartphone },
};
export function PublicPreviewUnavailable({ error }: { error: string | null }) {
  return (
    <PublicShell title="公开原型">
      <div className={styles.empty}>
        <Empty title="没有找到这个公开版本">
          <p>
            {error ?? "链接可能有误，或这个版本已不可用。请向分享者核对链接。"}
          </p>
        </Empty>
      </div>
    </PublicShell>
  );
}
export function PublicPreviewView({ meta }: { meta: PublicPreview }) {
  const [device, setDevice] = useState(meta.devices?.[0]),
    [rotated, setRotated] = useState(false),
    [zoom, setZoom] = useState("fit"),
    [attempt, setAttempt] = useState(0);
  const [available, setAvailable] = useState({ width: 1000, height: 700 });
  const canvas = useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery("(max-width: 760px)");
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search),
        chosen = q.get("device");
      const device = meta.devices?.some((d) => d === chosen)
        ? (chosen as keyof typeof DEVICE_VIEWPORTS)
        : meta.devices?.[0];
      const base = meta.viewport ?? DEVICE_VIEWPORTS[device ?? "pc-web"];
      setDevice(device);
      setRotated(
        !meta.viewport &&
          ["portrait", "landscape"].includes(q.get("orientation") ?? "") &&
          q.get("orientation") !==
            (base.width >= base.height ? "landscape" : "portrait"),
      );
      setZoom(q.get("zoom") === "actual" ? "actual" : "fit");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [meta.devices, meta.viewport]);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const viewport = meta.viewport ?? DEVICE_VIEWPORTS[device ?? "pc-web"],
    size = rotated
      ? { width: viewport.height, height: viewport.width }
      : viewport;
  const scale =
    zoom === "actual"
      ? 1
      : Math.min(
          1,
          Math.max(1, available.width - 32) / size.width,
          Math.max(1, available.height - 32) / size.height,
        );
  const changeView = (next: {
    device?: typeof device;
    rotated?: boolean;
    zoom?: string;
  }) => {
    const nextDevice = next.device ?? device,
      nextRotated = next.rotated ?? rotated,
      nextZoom = next.zoom ?? zoom,
      base = meta.viewport ?? DEVICE_VIEWPORTS[nextDevice ?? "pc-web"],
      size = nextRotated ? { width: base.height, height: base.width } : base,
      url = new URL(window.location.href);
    setDevice(nextDevice);
    setRotated(nextRotated);
    setZoom(nextZoom);
    if (meta.viewport) {
      url.searchParams.delete("device");
      url.searchParams.delete("orientation");
    } else {
      url.searchParams.set("device", nextDevice ?? "pc-web");
      url.searchParams.set(
        "orientation",
        size.width >= size.height ? "landscape" : "portrait",
      );
    }
    url.searchParams.set("zoom", nextZoom);
    window.history.replaceState(window.history.state, "", url);
  };
  const controls = (
    <div className={styles.controls}>
      {meta.devices && (
        <SegmentedControl
          label="预览设备"
          className={styles.devices}
          value={device ?? meta.devices[0]}
          onValueChange={(value) => {
            changeView({ device: value, rotated: false });
          }}
          items={meta.devices.map((value) => {
            const Icon = devices[value].icon;
            return { value, ariaLabel: devices[value].label, label: <Icon /> };
          })}
        />
      )}
      {!meta.viewport && device !== "pc-web" && (
        <IconButton
          aria-label="旋转视口"
          tooltip
          onClick={() => changeView({ rotated: !rotated })}
        >
          <RotateCw />
        </IconButton>
      )}
      {!mobile && (
        <SegmentedControl
          label="缩放"
          value={zoom}
          onValueChange={(zoom) => changeView({ zoom })}
          size="sm"
          items={[
            { value: "fit", label: "适应", ariaLabel: "适应画布" },
            { value: "actual", label: "100%" },
          ]}
        />
      )}
      <IconButton
        aria-label="重新加载原型"
        tooltip
        onClick={() => setAttempt((value) => value + 1)}
      >
        <RefreshCw />
      </IconButton>
    </div>
  );
  return (
    <PublicShell
      title={meta.title}
      label="公开 · 固定版本"
      actions={<>{!mobile && controls}</>}
    >
      <div className={styles.viewer}>
        {mobile && <div className={styles.mobileTools}>{controls}</div>}
        <div
          className={styles.canvas}
          ref={canvas}
          aria-label="公开原型画布"
          tabIndex={0}
        >
          <div className={styles.inner}>
            <div
              className={styles.frame}
              style={{ width: size.width * scale, height: size.height * scale }}
            >
              <PrototypeFrame
                key={attempt}
                title={meta.title}
                src={
                  meta.type === "hosted"
                    ? meta.url
                    : `/api/public-previews/${meta.id}/index.html`
                }
                width={size.width}
                height={size.height}
                referrerPolicy="no-referrer"
                style={{
                  width: size.width,
                  height: size.height,
                  transform: `scale(${scale})`,
                }}
              />
            </div>
          </div>
        </div>
        <p className={styles.caption}>
          {meta.viewport ? "组件" : devices[device ?? "pc-web"].label} ·{" "}
          {size.width} × {size.height} ·{" "}
          {zoom === "actual" ? "100%" : "适应窗口"}
          <span title={meta.revision}>{meta.revision.slice(0, 12)}</span>
        </p>
      </div>
    </PublicShell>
  );
}
