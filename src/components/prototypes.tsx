"use client";
import { Badge } from "@open-folio/ui";
import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import {
  ArrowUpRight,
  Ellipsis,
  ImageOff,
  LoaderCircle,
  Monitor,
  PanelsTopLeft,
  Search,
  Smartphone,
  Square,
  Tablet,
  X,
} from "lucide-react";
import { STATUS_LABELS } from "@/lib/model";
import { previewViewport } from "@/lib/preview-viewport";
import {
  DEVICE_LABELS,
  matchingPrototypeReferences,
  type PrototypeCatalog,
  type PrototypeItem,
  type PrototypeReference,
} from "@/lib/prototypes";
import { api, useSavedScroll, useWorkspace } from "./context";
import { ChangeDrawer } from "./changes";
import { Empty, ErrorNotice } from "./document";

const viewportKeys = ["pc-web", "ipad", "mobile", "custom"];
const clearPreview = {
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
  const device = viewportKeys.includes(q.pdevice) ? q.pdevice : "";
  const query = q.pq ?? "";
  const items = catalog?.items ?? [];
  const rows = items
    .map((item) => ({
      item,
      refs: matchingPrototypeReferences(item, query, device),
    }))
    .filter(
      ({ item, refs }) => (!kind || item.kind === kind) && refs.length > 0,
    );
  const filterKey = `${key}:${query}:${kind}:${device}`;
  const limit = page.key === filterKey ? page.limit : 24;
  const changes = new Set(
    items.flatMap((item) => item.references.map((ref) => ref.changeId)),
  ).size;
  const filtered = !!(query || kind || device);
  const clear = () => nav({ pq: null, pkind: null, pdevice: null });
  return (
    <section className="prototypes-workspace" aria-label="项目原型总览">
      <div className="changes-heading prototype-gallery-heading">
        <div>
          <div className="eyebrow">PROJECT PROTOTYPES</div>
          <h1>原型 {catalog && <span>{items.length}</span>}</h1>
          <p>浏览项目的页面与组件，沿着 Change 找到设计背景。</p>
        </div>
        {catalog && (
          <dl className="prototype-totals" aria-label="项目原型统计">
            <div>
              <dt>页面</dt>
              <dd>{items.filter((item) => item.kind === "page").length}</dd>
            </div>
            <div>
              <dt>组件</dt>
              <dd>
                {items.filter((item) => item.kind === "component").length}
              </dd>
            </div>
            <div>
              <dt>关联 Change</dt>
              <dd>{changes}</dd>
            </div>
          </dl>
        )}
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
              placeholder="搜索原型、路径或 Change…"
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
              <button className="text-button" onClick={clear}>
                清除筛选
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="prototype-gallery-scroll" ref={scroll}>
        {response.key === key && response.error ? (
          <ErrorNotice>
            {response.error}
            <button
              className="text-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              重新读取原型列表
            </button>
          </ErrorNotice>
        ) : !catalog ? (
          <Empty title="正在读取项目原型…" />
        ) : (
          <>
            {catalog.policy.status !== "enabled" && (
              <div className="prototype-policy" role="status">
                <strong>原型追踪未启用</strong>
                <p>{catalog.policy.message}</p>
                {items.length > 0 && (
                  <span>以下保留已有关联，启用后可继续预览。</span>
                )}
              </div>
            )}
            {catalog.issues.length > 0 && (
              <details className="prototype-issues">
                <summary>
                  {new Set(catalog.issues.map((issue) => issue.changeId)).size}{" "}
                  个 Change 的原型关联需检查
                </summary>
                <ul>
                  {catalog.issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        className="text-button"
                        onClick={() =>
                          nav({
                            ...clearPreview,
                            m: "changes",
                            c: issue.changeId,
                            ct: "overview",
                          })
                        }
                      >
                        {issue.changeTitle}
                      </button>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!items.length ? (
              <Empty
                title={
                  catalog.issues.length
                    ? "暂时没有可统计的原型"
                    : "项目还没有关联原型"
                }
                icon={<PanelsTopLeft size={28} />}
              >
                <p>
                  {catalog.issues.length
                    ? "先核对上方关联记录，再刷新中心仓库。"
                    : "页面或组件关联到 Change 并推送后，会出现在这里。"}
                </p>
              </Empty>
            ) : (
              <>
                <div className="prototype-result-line">
                  <span aria-live="polite">
                    {filtered
                      ? `找到 ${rows.length} 个原型`
                      : `${items.length} 个已关联原型`}
                  </span>
                  <span>共享入口合并展示</span>
                </div>
                {!rows.length ? (
                  <Empty title="没有匹配的原型">
                    <p>调整搜索词或适配范围，查看其他页面与组件。</p>
                    <button className="button" onClick={clear}>
                      清除筛选
                    </button>
                  </Empty>
                ) : (
                  <ul className="prototype-grid" aria-label="项目原型列表">
                    {rows.slice(0, limit).map(({ item, refs }) => (
                      <PrototypeCard
                        key={item.key}
                        item={item}
                        references={refs}
                        enabled={catalog.policy.status === "enabled"}
                      />
                    ))}
                  </ul>
                )}
                {rows.length > limit && (
                  <button
                    className="button prototype-load-more"
                    onClick={() =>
                      setPage({ key: filterKey, limit: limit + 24 })
                    }
                  >
                    显示更多原型（已显示 {limit} / {rows.length}）
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <ChangeDrawer />
    </section>
  );
}
function PrototypeCard({
  item,
  references,
  enabled,
}: {
  item: PrototypeItem;
  references: PrototypeReference[];
  enabled: boolean;
}) {
  const { nav, q, projectId, data } = useWorkspace();
  const [selection, setSelection] = useState("");
  const identity = (ref: PrototypeReference) =>
    `${ref.changeId}/${ref.entry.id}`;
  const ref =
    references.find((ref) => identity(ref) === selection) ?? references[0];
  const { entry } = ref;
  const { device, viewport } = previewViewport(entry, q.pdevice);
  const params = new URLSearchParams({ snapshot: data!.id });
  if (device) params.set("device", device);
  const imageUrl = `/api/projects/${encodeURIComponent(projectId)}/thumbnails/${encodeURIComponent(ref.changeId)}/${encodeURIComponent(entry.id)}?${params}`;
  const related = new Set(item.references.map((ref) => ref.changeId)).size;
  const open = () =>
    nav({
      ...clearPreview,
      c: ref.changeId,
      ct: "previews",
      preview: entry.id,
      device: device ?? null,
    });
  const deviceIcons = { "pc-web": Monitor, ipad: Tablet, mobile: Smartphone };
  return (
    <li className="prototype-tile">
      <PrototypeThumbnail
        key={imageUrl + enabled}
        url={imageUrl}
        title={entry.title}
        viewport={viewport}
        enabled={enabled}
        open={open}
      />
      <div className="prototype-tile-caption">
        <h2 aria-label={entry.title}>
          <button
            className="prototype-title-open"
            disabled={!enabled}
            aria-label={`${enabled ? "打开预览" : "预览未启用"}：${entry.title}`}
            onClick={open}
          >
            {entry.title}
          </button>
        </h2>
        <span className="prototype-kind-label">
          {item.kind === "page" ? "页面" : "组件"}
        </span>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              className="prototype-info-trigger"
              aria-label={`${entry.title}的原型信息`}
              title="原型信息"
            >
              <Ellipsis size={20} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="prototype-info"
              align="end"
              sideOffset={8}
              collisionPadding={16}
              aria-label={`${entry.title}的原型信息`}
            >
              <div className="prototype-info-header">
                <h3>原型信息</h3>
                <Popover.Close asChild>
                  <button
                    className="prototype-info-close"
                    aria-label="关闭原型信息"
                  >
                    <X size={17} />
                  </button>
                </Popover.Close>
              </div>
              <div className="prototype-tile-source">
                <label>
                  <span>关联版本 · {related} 个 Change</span>
                  {references.length > 1 ? (
                    <select
                      aria-label={`${entry.title}的关联版本`}
                      value={identity(ref)}
                      onChange={(e) => setSelection(e.target.value)}
                    >
                      {references.map((source) => (
                        <option key={identity(source)} value={identity(source)}>
                          {source.changeTitle} · {STATUS_LABELS[source.status]}{" "}
                          · {source.entry.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="prototype-source-name">
                      {ref.changeTitle}
                    </span>
                  )}
                </label>
                <div>
                  <code>{ref.changeId}</code>
                  <Badge
                    tone={
                      ref.status === "completed"
                        ? "success"
                        : ref.status === "active"
                          ? "info"
                          : "danger"
                    }
                  >
                    {ref.archived ? "已归档" : STATUS_LABELS[ref.status]}
                  </Badge>
                </div>
              </div>
              <div className="prototype-adaptations" aria-label="声明适配">
                {entry.devices?.map((device) => {
                  const DeviceIcon = deviceIcons[device];
                  return (
                    <span key={device}>
                      <DeviceIcon size={13} />
                      {DEVICE_LABELS[device]}
                    </span>
                  );
                })}
                {entry.viewport && (
                  <span>
                    <Square size={13} />
                    {entry.viewport.width} × {entry.viewport.height} · 自定义
                  </span>
                )}
              </div>
              <p className="prototype-capture-size">
                截图视口 {viewport.width} × {viewport.height} · 首屏
              </p>
              <code className="prototype-path">{item.path}</code>
              <Popover.Close asChild>
                <button
                  className="text-button prototype-source-link"
                  onClick={() =>
                    nav({
                      ...clearPreview,
                      m: "changes",
                      c: ref.changeId,
                      ct: "overview",
                    })
                  }
                >
                  查看 Change <ArrowUpRight size={14} />
                </button>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
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
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
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
              ? "截图未启用"
              : status === "error"
                ? "截图暂不可用"
                : "正在准备截图…"}
          </span>
          {enabled && status === "error" && (
            <button
              className="text-button"
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            >
              重试截图
            </button>
          )}
        </div>
      )}
    </div>
  );
}
