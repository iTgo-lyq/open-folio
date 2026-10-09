"use client";
import { Badge, Button, IconButton } from "@open-folio/ui";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ImageOff, LoaderCircle, PanelsTopLeft, Search, X } from "lucide-react";
import { previewViewport } from "@/lib/preview-viewport";
import {
  DEVICE_LABELS,
  matchesPrototype,
  type PrototypeCatalog,
  type PrototypeItem,
} from "@/lib/prototypes";
import { api, useSavedScroll, useWorkspace } from "./context";
import { Empty, ErrorNotice } from "./document";
import { ChangePreviews } from "./previews";
const clearPreview = {
  prototype: null,
  c: null,
  ct: null,
  preview: null,
  device: null,
  orientation: null,
  revision: null,
  zoom: null,
};
export default function Prototypes() {
  const { data, projectId, q, nav } = useWorkspace();
  const key = `${projectId}:${data!.id}`;
  const [response, setResponse] = useState<{
    key: string;
    value?: PrototypeCatalog;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState({ key: "", limit: 24 });
  const scroll = useSavedScroll(`${projectId}.prototypes`);
  const focus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<PrototypeCatalog>(
      `/api/projects/${encodeURIComponent(projectId)}/prototypes?snapshot=${data!.id}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResponse({ key, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResponse({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key, projectId, data, retry]);
  const catalog = response.key === key ? response.value : undefined;
  const kind = ["page", "component"].includes(q.pkind) ? q.pkind : "";
  const device = ["pc-web", "ipad", "mobile", "custom"].includes(q.pdevice)
    ? q.pdevice
    : "";
  const query = q.pq ?? "",
    items = catalog?.items ?? [];
  const rows = items.filter(
    (item) =>
      (!kind || item.kind === kind) && matchesPrototype(item, query, device),
  );
  const filterKey = `${key}:${query}:${kind}:${device}`,
    limit = page.key === filterKey ? page.limit : 24;
  const filtered = !!(query || kind || device);
  const clear = () => nav({ pq: null, pkind: null, pdevice: null });
  return (
    <section className="prototypes-workspace" aria-label="项目原型总览">
      <div className="changes-heading prototype-gallery-heading">
        <div>
          <div className="eyebrow">EXPLORE THE PROJECT</div>
          <h1>项目里的页面 {catalog && <span>{items.length}</span>}</h1>
          <p>从一个入口，发现项目的页面、细节与各种状态。</p>
        </div>
        <Badge tone="info">main · 当前状态</Badge>
      </div>
      <div className="prototype-catalog-controls">
        <div className="scope-tabs" role="group" aria-label="原型类型">
          {[
            ["", "全部"],
            ["page", "页面"],
            ["component", "组件"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={kind === value}
              onClick={() => nav({ pkind: value || null })}
            >
              {label}
              <span>
                {value
                  ? items.filter((item) => item.kind === value).length
                  : items.length}
              </span>
            </button>
          ))}
        </div>
        <div className="changes-toolbar prototype-catalog-toolbar">
          <label className="change-search">
            <Search size={15} />
            <input
              aria-label="筛选原型"
              placeholder="搜索页面名称或说明…"
              value={query}
              onChange={(e) => nav({ pq: e.target.value || null }, true)}
            />
          </label>
          <div className="filter-controls">
            <select
              aria-label="筛选原型适配"
              value={device}
              onChange={(e) => nav({ pdevice: e.target.value || null })}
            >
              <option value="">所有适配</option>
              {Object.entries(DEVICE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="custom">自定义尺寸</option>
            </select>
            {filtered && (
              <Button variant="text" onClick={clear}>
                清除筛选
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="prototype-gallery-scroll" ref={scroll}>
        {response.key === key && response.error ? (
          <ErrorNotice>
            {response.error}
            <Button variant="text" onClick={() => setRetry((v) => v + 1)}>
              重新读取原型列表
            </Button>
          </ErrorNotice>
        ) : !catalog ? (
          <Empty title="正在读取项目原型…" />
        ) : (
          <>
            {catalog.message && (
              <div className="prototype-policy" role="status">
                <p>{catalog.message}</p>
              </div>
            )}
            {!!catalog.issues.length && (
              <details className="prototype-issues">
                <summary>{catalog.issues.length} 项清单内容需检查</summary>
                <ul>
                  {catalog.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
            {!items.length ? (
              <Empty title="暂无当前页面" icon={<PanelsTopLeft size={28} />}>
                <p>项目在 main 登记页面预览后，就会展示在这里。</p>
              </Empty>
            ) : (
              <>
                <div className="prototype-result-line">
                  <span aria-live="polite">
                    {filtered
                      ? `找到 ${rows.length} 个原型`
                      : `${items.length} 个当前入口`}
                  </span>
                </div>
                {!rows.length ? (
                  <Empty title="没有匹配的原型">
                    <p>调整搜索词或适配范围，查看其他页面与组件。</p>
                    <Button onClick={clear}>清除筛选</Button>
                  </Empty>
                ) : (
                  <ul className="prototype-grid" aria-label="项目原型列表">
                    {rows.slice(0, limit).map((item) => (
                      <PrototypeCard
                        key={item.id}
                        item={item}
                        revision={catalog.revision!}
                      />
                    ))}
                  </ul>
                )}
                {rows.length > limit && (
                  <Button
                    className="prototype-load-more"
                    onClick={() =>
                      setPage({ key: filterKey, limit: limit + 24 })
                    }
                  >
                    显示更多原型（已显示 {limit} / {rows.length}）
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <Dialog.Root
        open={!!q.prototype}
        onOpenChange={(open) => {
          if (!open) nav(clearPreview);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content
            className="change-drawer with-preview"
            aria-describedby={undefined}
            onOpenAutoFocus={() => {
              focus.current = document.activeElement as HTMLElement;
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (focus.current?.isConnected) focus.current.focus();
            }}
          >
            <header className="drawer-toolbar">
              <Dialog.Title>页面预览</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton aria-label="关闭页面预览">
                  <X size={19} />
                </IconButton>
              </Dialog.Close>
            </header>
            <div className="current-preview-body">
              <ChangePreviews current />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
function PrototypeCard({
  item,
  revision,
}: {
  item: PrototypeItem;
  revision: string;
}) {
  const { nav, q, projectId } = useWorkspace();
  const { device, viewport } = previewViewport(item, q.pdevice);
  const params = new URLSearchParams({ revision });
  if (device) params.set("device", device);
  const imageUrl = `/api/projects/${encodeURIComponent(projectId)}/current-thumbnails/${encodeURIComponent(item.id)}?${params}`;
  const open = () =>
    nav({
      ...clearPreview,
      prototype: item.id,
      preview: item.id,
      revision,
      device: device ?? null,
    });
  const hasThumbnail =
    item.artifact?.type === "git" ||
    (item.artifact?.type === "hosted" &&
      item.artifact.thumbnails?.some((t) => t.device === device));
  return (
    <li className="prototype-tile">
      <PrototypeThumbnail
        key={imageUrl}
        url={imageUrl}
        title={item.title}
        viewport={viewport}
        enabled={!!hasThumbnail}
        open={open}
      />
      <div className="prototype-tile-caption">
        <h2 aria-label={item.title}>
          <button
            className="prototype-title-open"
            aria-label={`打开预览：${item.title}`}
            onClick={open}
          >
            {item.title}
          </button>
        </h2>
        <span className="prototype-kind-label">
          {item.kind === "page" ? "页面" : "组件"}
        </span>
      </div>
      <p className="prototype-description">
        {item.description ??
          (item.artifact ? "打开查看页面与交互细节" : "尚未发布预览")}
      </p>
    </li>
  );
}
function PrototypeThumbnail({
  url,
  title,
  viewport,
  enabled,
  open,
}: {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  enabled: boolean;
  open: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading"),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!enabled || !visible || status !== "loading") return;
    const timer = setTimeout(() => setStatus("error"), 12000);
    return () => clearTimeout(timer);
  }, [enabled, visible, status, attempt]);
  return (
    <div className={`prototype-thumbnail ${status}`} ref={root}>
      {enabled && visible && status !== "error" && (
        <button
          className="prototype-thumbnail-open"
          aria-label={`预览${title}`}
          onClick={open}
        >
          <img
            key={attempt}
            src={`${url}&attempt=${attempt}`}
            alt={`${title}的首屏截图`}
            referrerPolicy="no-referrer"
            width={viewport.width}
            height={viewport.height}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        </button>
      )}
      {(!enabled || status !== "ready") && (
        <div className="prototype-thumbnail-state" role="status">
          {enabled && status === "loading" ? (
            <LoaderCircle size={20} className="spin" />
          ) : (
            <ImageOff size={20} />
          )}
          <span>
            {!enabled
              ? "尚未提供截图"
              : status === "error"
                ? "截图暂不可用"
                : "正在准备截图…"}
          </span>
          {enabled && status === "error" ? (
            <Button
              variant="text"
              onClick={() => {
                setStatus("loading");
                setAttempt((v) => v + 1);
              }}
            >
              重试截图
            </Button>
          ) : (
            !enabled && (
              <Button variant="text" onClick={open}>
                查看页面
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
