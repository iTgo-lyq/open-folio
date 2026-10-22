"use client";
import { usePublication } from "./publication";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Square,
  RotateCw,
  Link2,
  RefreshCw,
  GitCommitHorizontal,
  PanelsTopLeft,
  ExternalLink,
  List,
  X,
  Info,
} from "lucide-react";
import {
  Button,
  SegmentedControl,
  IconButton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@open-folio/ui";
import { ToolbarSlot } from "./toolbar-slot";
import { PublicLinkPopover } from "./public-link-popover";
import { useMediaQuery } from "./use-media";
import styles from "./previews.module.css";
const previewClass = (names: string) =>
  names
    .split(/\s+/)
    .map((name) => styles[name])
    .filter(Boolean)
    .join(" ");
import type { ChangeCandidate, Device, PreviewDescriptor } from "@/lib/model";
import { DEVICE_VIEWPORTS } from "@/lib/preview-viewport";
import { api, useWorkspace } from "./context";
import { Empty } from "./document";
const devices = {
  "pc-web": { label: "PC Web", ...DEVICE_VIEWPORTS["pc-web"], icon: Monitor },
  ipad: { label: "iPad", ...DEVICE_VIEWPORTS.ipad, icon: Tablet },
  mobile: { label: "移动设备", ...DEVICE_VIEWPORTS.mobile, icon: Smartphone },
};
export function ChangePreviews({
  change,
  current = false,
}: {
  change?: ChangeCandidate;
  current?: boolean;
}) {
  const { projectId, data, q, nav, notice, readUrl, sharing } = useWorkspace();
  const mobile = useMediaQuery("(max-width: 760px)");
  const requestKey = `${projectId}:${change?.id ?? ""}:${data?.id}:${q.revision ?? ""}`;
  const [response, setResponse] = useState<{
    key: string;
    value?: PreviewDescriptor;
    error?: string;
  }>({ key: "" });
  const [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(""),
    [loaded, setLoaded] = useState(""),
    [loadError, setLoadError] = useState(""),
    [runtimeError, setRuntimeError] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 440 });
  const canvas = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ snapshot: data!.id });
    if (q.revision) params.set("revision", q.revision);
    api<PreviewDescriptor>(
      readUrl(
        `${current ? "current-preview" : `previews/${encodeURIComponent(change?.id ?? "")}`}?${params}`,
      ),
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResponse({ key: requestKey, value });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResponse({ key: requestKey, error: e.message });
      });
    return () => controller.abort();
  }, [requestKey, projectId, change?.id, current, data, q.revision, readUrl]);
  const result = response.key === requestKey ? response.value : undefined;
  useEffect(() => {
    if (current && result?.revision) heading.current?.focus();
  }, [current, result?.revision]);
  const entry =
    result?.entries.find(
      (e) => e.id === (q.preview || (current ? q.prototype : undefined)),
    ) ??
    result?.entries.find((e) => e.available) ??
    result?.entries[0];
  const publication = usePublication(
    entry?.id,
    result?.revision ?? undefined,
    current ? undefined : change?.id,
    !!entry?.available && !sharing,
  );
  const chosenDevice = (
    entry?.devices?.includes(q.device as Device)
      ? q.device
      : entry?.devices?.[0]
  ) as Device | undefined;
  const base =
    entry?.viewport ??
    (chosenDevice ? devices[chosenDevice] : { width: 640, height: 320 });
  const orientation = ["portrait", "landscape"].includes(q.orientation)
    ? q.orientation
    : base.width >= base.height
      ? "landscape"
      : "portrait";
  const size = entry?.viewport
    ? base
    : orientation === "landscape"
      ? {
          width: Math.max(base.width, base.height),
          height: Math.min(base.width, base.height),
        }
      : {
          width: Math.min(base.width, base.height),
          height: Math.max(base.width, base.height),
        };
  const load = useMemo(
    () => (entry?.available ? crypto.randomUUID() : ""),
    [entry?.available, entry?.id, result?.revision, attempt],
  );
  const hosted =
    entry?.artifact?.type === "hosted" ? entry.artifact : undefined;
  const [hostStatus, setHostStatus] = useState("pending");
  const url = sharing
    ? entry?.url && !hosted
      ? `${entry.url}&load=${load}`
      : entry?.url
    : publication.publication && load
      ? hosted
        ? publication.publication.url
        : `/api/public-previews/${publication.publication.id}/index.html?load=${load}`
      : undefined;
  useEffect(() => {
    setReady("");
    setLoadError("");
    setRuntimeError("");
    if (!url) return;
    if (hosted) {
      setReady(load);
      return;
    }
    const controller = new AbortController();
    fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
      ...(sharing ? { credentials: "omit" as const } : {}),
    })
      .then((r) => {
        if (controller.signal.aborted) return;
        if (sharing && !r.ok && [403, 404, 409].includes(r.status))
          window.dispatchEvent(
            new CustomEvent("openfolio-share-error", {
              detail: {
                path: url,
                code:
                  r.status === 409
                    ? "SHARE_VERSION_CHANGED"
                    : "SHARE_UNAVAILABLE",
              },
            }),
          );
        if (!r.ok)
          throw Error(
            r.status === 401 || r.status === 403
              ? "预览访问未通过认证，请重新登录后重试。"
              : "该入口已不可用，请重新读取中心仓库后查看。",
          );
        setReady(load);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message);
      });
    return () => controller.abort();
  }, [url, load, hosted, sharing]);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ width, height });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [result?.revision, entry?.id]);
  useEffect(() => {
    const report = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "openfolio-preview-error" ||
        event.data.load !== load
      )
        return;
      if (event.data.code === "network-blocked")
        setRuntimeError(
          "原型仍依赖外部资源或不支持的能力，请重新导出自包含 HTML。",
        );
      if (event.data.code === "runtime-error")
        setRuntimeError("原型脚本发生错误，请在原型包中检查并重新导出。");
    };
    window.addEventListener("message", report);
    return () => window.removeEventListener("message", report);
  }, [load]);
  useEffect(() => {
    setHostStatus("pending");
    if (!hosted || !load) return;
    let confirmed = false;
    const send = () =>
      frame.current?.contentWindow?.postMessage(
        { type: "openfolio:preview:init", requestId: load },
        "*",
      );
    const timer = window.setTimeout(() => {
      if (!confirmed) setHostStatus("slow");
    }, 5000);
    const interval = window.setInterval(send, 500);
    const report = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "openfolio:preview:status" ||
        event.data.requestId !== load ||
        event.data.version !== hosted.version ||
        !["ready", "error"].includes(event.data.status)
      )
        return;
      confirmed = true;
      setHostStatus(event.data.status);
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
    window.addEventListener("message", report);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      window.removeEventListener("message", report);
    };
  }, [hosted, load]);
  const scale =
    q.zoom === "actual"
      ? 1
      : Math.min(
          1,
          Math.max(1, canvasSize.width - 32) / size.width,
          Math.max(1, canvasSize.height - 32) / size.height,
        );
  async function copy() {
    if (!result?.revision || !entry) return;
    if (sharing) {
      const link = new URL(window.location.href);
      link.searchParams.set("ct", "previews");
      link.searchParams.set("preview", entry.id);
      try {
        await navigator.clipboard.writeText(link.href);
        notice("已复制原型分享链接");
      } catch {
        notice("未能复制，请从浏览器地址栏复制链接。");
      }
      return;
    }
    if (!publication.url) {
      notice(publication.error ?? "公开版本正在准备，请稍后重试。");
      return;
    }
    const link = new URL(publication.url, window.location.origin);
    if (chosenDevice) link.searchParams.set("device", chosenDevice);
    link.searchParams.set("orientation", orientation);
    try {
      await navigator.clipboard.writeText(link.href);
      notice("已复制固定版本原型链接");
    } catch {
      notice("未能复制链接，请检查浏览器剪贴板权限。");
    }
  }
  if (response.key === requestKey && response.error)
    return (
      <Empty title="原型读取失败">
        <p>{response.error}</p>
      </Empty>
    );
  if (!result)
    return (
      <div className={previewClass("preview-loading")} role="status">
        正在读取原型入口…
      </div>
    );
  if (!result.entries.length)
    return (
      <Empty
        title={
          result.failed
            ? "原型读取失败"
            : result.policy.status === "enabled"
              ? "暂无可预览的入口"
              : "原型追踪未启用"
        }
      >
        <p>{result.message ?? result.policy.message}</p>
        {!current && result.policy.branch && (
          <p className={previewClass("subtle-note")}>
            配置来源：{result.policy.branch}
          </p>
        )}
      </Empty>
    );
  const entries = (
    <div
      className={previewClass("preview-entries")}
      role="group"
      aria-label="原型入口"
    >
      {result.entries.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={entry?.id === item.id}
          className={previewClass("preview-entry")}
          data-preview-entry
          onClick={() => {
            nav({
              preview: item.id,
              ...(current ? { prototype: item.id, pdetail: null } : {}),
              device: null,
              orientation: null,
            });
            setDirectoryOpen(false);
          }}
        >
          {item.kind === "page" ? (
            <PanelsTopLeft size={16} />
          ) : (
            <Square size={16} />
          )}
          <span>
            {item.title}
            <small>
              {item.kind === "page" ? "页面" : "组件"}
              {!item.available ? " · 暂不可用" : ""}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
  const controls = (
    <div
      className={previewClass(
        `preview-controls ${current ? "current-controls" : ""}`,
      )}
    >
      {entry?.devices && (
        <SegmentedControl
          label="预览设备"
          className={styles.devices}
          value={chosenDevice ?? entry.devices[0]}
          onValueChange={(device) => nav({ device, orientation: null })}
          items={entry.devices.map((value) => {
            const Icon = devices[value].icon;
            return {
              value,
              ariaLabel: devices[value].label,
              label: (
                <>
                  <Icon />
                  <span>{devices[value].label}</span>
                </>
              ),
            };
          })}
        />
      )}
      {entry?.viewport && (
        <span className={styles.custom}>
          <Square />
          自定义组件
        </span>
      )}
      {!entry?.viewport && (!current || chosenDevice !== "pc-web") && (
        <IconButton
          aria-label="切换横竖方向"
          tooltip
          onClick={() =>
            nav({
              orientation:
                orientation === "landscape" ? "portrait" : "landscape",
            })
          }
        >
          <RotateCw />
        </IconButton>
      )}
      {!(current && mobile) && (
        <SegmentedControl
          label="缩放"
          size="sm"
          value={q.zoom === "actual" ? "actual" : "fit"}
          onValueChange={(zoom) => nav({ zoom: zoom === "fit" ? null : zoom })}
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
    <section
      className={previewClass(
        `prototype-panel ${current ? "prototype-viewer" : ""}`,
      )}
      data-directory-open={directoryOpen}
      aria-label={current ? "当前页面预览" : "Change 原型预览"}
    >
      {current ? (
        <>
          <ToolbarSlot side="left">
            <h1 className={styles.title} ref={heading} tabIndex={-1}>
              {entry?.title}
            </h1>
          </ToolbarSlot>
          <ToolbarSlot side="right">
            <IconButton
              aria-label="切换原型目录"
              tooltip
              aria-expanded={directoryOpen}
              onClick={() => setDirectoryOpen((value) => !value)}
            >
              <List />
            </IconButton>
            {controls}
            <PublicLinkPopover
              url={publication.url}
              error={publication.error}
              retry={publication.retry}
              device={chosenDevice}
              orientation={orientation}
              disabled={!entry?.available}
            />
            <IconButton
              aria-label="原型详情"
              tooltip
              onClick={() => nav({ pdetail: entry?.id ?? null })}
            >
              <Info />
            </IconButton>
          </ToolbarSlot>
          <Sheet open={directoryOpen} onOpenChange={setDirectoryOpen}>
            <SheetContent side="left" aria-describedby={undefined}>
              <SheetHeader>
                <SheetTitle>原型目录</SheetTitle>
                <IconButton
                  aria-label="关闭原型目录"
                  onClick={() => setDirectoryOpen(false)}
                >
                  <X />
                </IconButton>
              </SheetHeader>
              <SheetBody>
                <nav aria-label="原型目录">{entries}</nav>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <>
          <div className={previewClass("preview-heading")}>
            <h2>原型入口</h2>
            <span>{result.entries.length} 个入口</span>
          </div>
          {entries}
        </>
      )}
      <div
        className={previewClass("preview-stage")}
        aria-label={current ? "原型画布" : undefined}
      >
        {(q.preview || (current && q.prototype)) &&
          !result.entries.some((e) => e.id === (q.preview || q.prototype)) && (
            <p className={previewClass("warning-text")}>
              链接中的入口不存在，已显示首个可用入口。
            </p>
          )}
        {q.device &&
          entry?.devices &&
          !entry.devices.includes(q.device as Device) && (
            <p className={previewClass("warning-text")}>
              该入口未声明链接中的设备，已选择其支持的尺寸。
            </p>
          )}
        {!current && controls}
        {!current && (
          <div className={previewClass("preview-dimensions")}>
            <span>
              {size.width} × {size.height} CSS px
            </span>
            <span>显示比例 {Math.round(scale * 100)}%</span>
          </div>
        )}
        {runtimeError && (
          <div className={previewClass("preview-runtime-error")} role="alert">
            {runtimeError}
          </div>
        )}
        {hosted &&
          entry?.available &&
          !loadError &&
          (!current ||
            hostStatus === "error" ||
            (loaded !== load && hostStatus !== "ready")) && (
            <div
              className={previewClass("preview-host-status")}
              data-preview-host-status
              role={hostStatus === "error" ? "alert" : "status"}
            >
              <span>
                {hostStatus === "ready"
                  ? "页面已就绪"
                  : hostStatus === "error"
                    ? "宿主报告页面运行失败，请在独立页面检查。"
                    : loaded === load
                      ? "页面已加载"
                      : hostStatus === "slow"
                        ? "页面加载较慢，可在独立页面查看。"
                        : "正在加载页面…"}
              </span>
              <a
                href={hosted.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                <ExternalLink size={13} /> 独立打开
              </a>
            </div>
          )}
        <div
          className={previewClass("preview-canvas")}
          ref={canvas}
          data-testid="preview-canvas"
        >
          {!entry?.available ? (
            <Empty title="暂时无法预览">
              <p>{entry?.message}</p>
            </Empty>
          ) : publication.error ? (
            <Empty title="公开原型准备失败">
              <p>{publication.error}</p>
              <Button onClick={publication.retry}>重新准备</Button>
            </Empty>
          ) : loadError ? (
            <Empty title="预览无法加载">
              <p>{loadError}</p>
            </Empty>
          ) : ready !== load ? (
            <div className={previewClass("preview-loading")} role="status">
              正在加载预览…
            </div>
          ) : (
            <div className={previewClass("preview-canvas-inner")}>
              <div
                className={previewClass("preview-frame-space")}
                style={{
                  width: size.width * scale,
                  height: size.height * scale,
                }}
              >
                <iframe
                  ref={frame}
                  key={load}
                  title={`原型：${entry.title}`}
                  src={url}
                  onLoad={() => setLoaded(load)}
                  sandbox="allow-scripts"
                  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'"
                  referrerPolicy="no-referrer"
                  width={size.width}
                  height={size.height}
                  style={{
                    width: size.width,
                    height: size.height,
                    transform: `scale(${scale})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
        {current && (
          <div className={previewClass("preview-canvas-status")}>
            <span>
              {size.width} × {size.height}
            </span>
            <span>{Math.round(scale * 100)}%</span>
          </div>
        )}
      </div>
      {!current && (
        <>
          <div
            className={previewClass("preview-provenance")}
            data-preview-provenance
          >
            <span>
              <GitCommitHorizontal size={14} />
              <code>{result.revision?.slice(0, 12)}</code>
              {result.pinned ? "归档版本" : "已推送版本"}
            </span>
            <button
              type="button"
              className={previewClass("text-button")}
              onClick={copy}
            >
              <Link2 size={13} />
              {sharing ? "复制原型分享链接" : "复制固定版本链接"}
            </button>
          </div>
          {q.revision && (
            <button
              type="button"
              className={previewClass("text-button")}
              onClick={() => nav({ revision: null })}
            >
              返回当前 Change 版本
            </button>
          )}
          <p className={previewClass("preview-footnote")} data-preview-footnote>
            {hosted
              ? `产物 ${hosted.version} · 源码 ${hosted.sourceCommit.slice(0, 12)}${entry?.sourceAvailable === false ? "（源码提交已不可用）" : ""}`
              : entry?.artifact?.type === "git"
                ? entry.artifact.path
                : ""}
            {" · "}适配范围由项目声明，画布缩放不改变布局尺寸。
          </p>
        </>
      )}
    </section>
  );
}
