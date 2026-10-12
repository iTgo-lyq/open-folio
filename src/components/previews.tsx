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
  Search,
  X,
} from "lucide-react";
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
  const { projectId, data, q, nav, notice, readUrl } = useWorkspace();
  const requestKey = `${projectId}:${change?.id ?? ""}:${data?.id}:${q.revision ?? ""}`;
  const [response, setResponse] = useState<{
    key: string;
    value?: PreviewDescriptor;
    error?: string;
  }>({ key: "" });
  const [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(""),
    [loadError, setLoadError] = useState(""),
    [runtimeError, setRuntimeError] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
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
    !!entry?.available,
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
    () => (entry?.available && entry.url ? crypto.randomUUID() : ""),
    [entry?.available, entry?.url, attempt],
  );
  const hosted =
    entry?.artifact?.type === "hosted" ? entry.artifact : undefined;
  const [hostStatus, setHostStatus] = useState("pending");
  const url =
    publication.publication && load
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
    fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal })
      .then((r) => {
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
  }, [url, load, hosted]);
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
      if (!confirmed) setHostStatus("unconfirmed");
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
  if (publication.error)
    return (
      <Empty title="公开原型准备失败">
        <p>{publication.error}</p>
        <button className="button" onClick={publication.retry}>
          重新准备
        </button>
      </Empty>
    );
  if (response.key === requestKey && response.error)
    return (
      <Empty title="原型读取失败">
        <p>{response.error}</p>
      </Empty>
    );
  if (!result)
    return (
      <div className="preview-loading" role="status">
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
          <p className="subtle-note">配置来源：{result.policy.branch}</p>
        )}
      </Empty>
    );
  const directoryItems = result.entries.filter(
    (item) =>
      !current ||
      `${item.title} ${item.id}`
        .toLocaleLowerCase()
        .includes(directoryQuery.trim().toLocaleLowerCase()),
  );
  const entries = (
    <div className="preview-entries" role="group" aria-label="原型入口">
      {directoryItems.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={entry?.id === item.id}
          className="preview-entry"
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
      {current && !directoryItems.length && (
        <p className="preview-directory-empty">没有匹配的原型</p>
      )}
    </div>
  );
  return (
    <section
      className={`prototype-panel ${current ? "prototype-viewer" : ""}`}
      data-directory-open={directoryOpen}
      aria-label={current ? "当前页面预览" : "Change 原型预览"}
    >
      {current ? (
        <aside className="preview-directory" aria-label="原型目录">
          <div className="preview-directory-heading">
            <span>项目页面</span>
            <span>{result.entries.length}</span>
            <button
              type="button"
              className="preview-directory-close icon-button"
              aria-label="关闭原型目录"
              onClick={() => setDirectoryOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="preview-directory-search">
            <Search size={14} />
            <input
              aria-label="筛选预览目录"
              placeholder="查找页面…"
              value={directoryQuery}
              onChange={(e) => setDirectoryQuery(e.target.value)}
            />
          </label>
          {entries}
        </aside>
      ) : (
        <>
          <div className="preview-heading">
            <div>
              <span className="preview-eyebrow">PROTOTYPE</span>
              <h3>查看设计效果</h3>
            </div>
            <span className="subtle-note">{result.entries.length} 个入口</span>
          </div>
          {entries}
        </>
      )}
      <div
        className="preview-stage"
        aria-label={current ? "原型画布" : undefined}
      >
        {current && (
          <div className="preview-stage-heading">
            <h1 ref={heading} tabIndex={-1}>
              {entry?.title}
            </h1>
            <button
              type="button"
              className="icon-button"
              aria-label="复制预览链接"
              title="复制预览链接"
              onClick={copy}
            >
              <Link2 size={16} />
            </button>
          </div>
        )}
        {(q.preview || (current && q.prototype)) &&
          !result.entries.some((e) => e.id === (q.preview || q.prototype)) && (
            <p className="warning-text">
              链接中的入口不存在，已显示首个可用入口。
            </p>
          )}
        {q.device &&
          entry?.devices &&
          !entry.devices.includes(q.device as Device) && (
            <p className="warning-text">
              该入口未声明链接中的设备，已选择其支持的尺寸。
            </p>
          )}
        <div className="preview-controls">
          {current && (
            <button
              type="button"
              className="preview-directory-toggle"
              aria-label="切换原型目录"
              aria-expanded={directoryOpen}
              onClick={() => setDirectoryOpen((value) => !value)}
            >
              <List size={16} />
              <span>目录</span>
            </button>
          )}
          <div className="preview-devices" role="group" aria-label="预览设备">
            {entry?.devices?.map((device) => {
              const d = devices[device],
                Icon = d.icon;
              return (
                <button
                  type="button"
                  key={device}
                  aria-pressed={chosenDevice === device}
                  onClick={() => nav({ device, orientation: null })}
                >
                  <Icon size={15} />
                  {d.label}
                </button>
              );
            })}
            {entry?.viewport && (
              <span className="preview-custom">
                <Square size={14} />
                自定义组件
              </span>
            )}
          </div>
          <div className="preview-tools">
            {!entry?.viewport && (
              <button
                type="button"
                className="icon-button"
                aria-label="切换横竖方向"
                title="切换横竖方向"
                onClick={() =>
                  nav({
                    orientation:
                      orientation === "landscape" ? "portrait" : "landscape",
                  })
                }
              >
                <RotateCw size={15} />
              </button>
            )}
            <button
              type="button"
              className="preview-zoom"
              aria-pressed={q.zoom !== "actual"}
              onClick={() => nav({ zoom: null })}
            >
              适应画布
            </button>
            <button
              type="button"
              className="preview-zoom"
              aria-pressed={q.zoom === "actual"}
              onClick={() => nav({ zoom: "actual" })}
            >
              100%
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="重新加载原型"
              title="重新加载原型"
              onClick={() => setAttempt((v) => v + 1)}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        {!current && (
          <div className="preview-dimensions">
            <span>
              {size.width} × {size.height} CSS px
            </span>
            <span>显示比例 {Math.round(scale * 100)}%</span>
          </div>
        )}
        {runtimeError && (
          <div className="preview-runtime-error" role="alert">
            {runtimeError}
          </div>
        )}
        {hosted &&
          entry?.available &&
          !loadError &&
          (!current || hostStatus !== "ready") && (
            <div className="preview-host-status" role="status">
              <span>
                {hostStatus === "ready"
                  ? "页面已就绪"
                  : hostStatus === "error"
                    ? "宿主报告页面运行失败，请在独立页面检查。"
                    : hostStatus === "unconfirmed"
                      ? "尚未确认页面就绪；若画布空白，可在独立页面查看。"
                      : "正在等待页面就绪…"}
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
          className="preview-canvas"
          ref={canvas}
          data-testid="preview-canvas"
        >
          {!entry?.available ? (
            <Empty title="暂时无法预览">
              <p>{entry?.message}</p>
            </Empty>
          ) : loadError ? (
            <Empty title="预览无法加载">
              <p>{loadError}</p>
            </Empty>
          ) : ready !== load ? (
            <div className="preview-loading" role="status">
              正在加载预览…
            </div>
          ) : (
            <div className="preview-canvas-inner">
              <div
                className="preview-frame-space"
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
          <div className="preview-canvas-status">
            <span>
              {size.width} × {size.height}
            </span>
            <span>{Math.round(scale * 100)}%</span>
          </div>
        )}
      </div>
      {!current && (
        <>
          <div className="preview-provenance">
            <span>
              <GitCommitHorizontal size={14} />
              <code>{result.revision?.slice(0, 12)}</code>
              {result.pinned ? "归档版本" : "已推送版本"}
            </span>
            <button type="button" className="text-button" onClick={copy}>
              <Link2 size={13} />
              复制固定版本链接
            </button>
          </div>
          {q.revision && (
            <button
              type="button"
              className="text-button"
              onClick={() => nav({ revision: null })}
            >
              返回当前 Change 版本
            </button>
          )}
          <p className="preview-footnote">
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
