"use client";
import { usePublication, publicationThumbnail } from "./publication";
import { Badge, Button, IconButton } from "@open-folio/ui";
import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle, PanelsTopLeft, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { previewViewport } from "@/lib/preview-viewport";
import {
  CLEAR_PROTOTYPE_VIEW,
  DEVICE_LABELS,
  type PrototypeCatalog,
  type PrototypeItem,
} from "@/lib/prototypes";
import { api, useSavedScroll, useWorkspace } from "./context";
import { Empty, ErrorNotice } from "./document";
import { ChangePreviews } from "./previews";
const clearPreview = CLEAR_PROTOTYPE_VIEW;
export default function Prototypes() {
  const { data, projectId, q, readUrl } = useWorkspace();
  const previous = useRef("");
  useEffect(() => {
    if (q.prototype) previous.current = q.prototype;
  }, [q.prototype]);
  const key = `${projectId}:${data!.id}`;
  const [response, setResponse] = useState<{
    key: string;
    value?: PrototypeCatalog;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<PrototypeCatalog>(readUrl(`prototypes?snapshot=${data!.id}`), {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setResponse({ key, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResponse({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key, projectId, data, retry, readUrl]);
  const catalog = response.key === key ? response.value : undefined;
  const error = response.key === key ? response.error : undefined;
  if (q.prototype) return <ChangePreviews current />;
  // Restore scroll only after the complete list exists; keep the fetched catalog
  // in this parent while the viewer temporarily replaces the gallery.
  if (!catalog)
    return (
      <section className="prototypes-workspace" aria-label="项目原型总览">
        {error ? (
          <ErrorNotice>
            {error}
            <Button
              variant="text"
              onClick={() => setRetry((value) => value + 1)}
            >
              重新读取原型列表
            </Button>
          </ErrorNotice>
        ) : (
          <Empty title="正在读取项目原型…" />
        )}
        <PrototypeDetails error={error} />
      </section>
    );
  return (
    <PrototypeGallery
      key={key}
      catalog={catalog}
      restoreId={previous.current}
    />
  );
}
function PrototypeGallery({
  catalog,
  restoreId,
}: {
  catalog: PrototypeCatalog;
  restoreId: string;
}) {
  const { projectId, q, nav } = useWorkspace();
  const scroll = useSavedScroll(`${projectId}.prototypes`);
  useEffect(() => {
    if (!catalog || !restoreId) return;
    const id = requestAnimationFrame(() => {
      const tile = document.querySelector(
        `[data-prototype-id="${CSS.escape(restoreId)}"]`,
      );
      (
        tile?.querySelector(
          ".prototype-thumbnail-open, .prototype-title-open",
        ) as HTMLElement | null
      )?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [catalog, restoreId]);
  const kind = ["page", "component"].includes(q.pkind) ? q.pkind : "";
  const device = ["pc-web", "ipad", "mobile", "custom"].includes(q.pdevice)
    ? q.pdevice
    : "";
  const items = catalog.items;
  const rows = items.filter(
    (item) =>
      (!kind || item.kind === kind) &&
      (!device ||
        (device === "custom"
          ? !!item.viewport
          : item.devices?.some((d) => d === device))),
  );
  const requestedLimit = Number(q.pcount);
  const limit =
    Number.isSafeInteger(requestedLimit) && requestedLimit > 24
      ? Math.min(requestedLimit, Math.max(24, rows.length))
      : 24;
  const filtered = !!(kind || device);
  const clear = () => nav({ pkind: null, pdevice: null, pcount: null });
  return (
    <section className="prototypes-workspace" aria-label="项目原型总览">
      <div className="changes-heading prototype-gallery-heading">
        <div>
          <div className="eyebrow">EXPLORE THE PROJECT</div>
          <h1 tabIndex={-1}>
            项目里的页面 {catalog && <span>{items.length}</span>}
          </h1>
          <p>从一个入口，发现项目的页面、细节与各种状态。</p>
        </div>
        <Badge tone="info">
          {catalog.policy.branch ?? "默认分支"} · 当前状态
        </Badge>
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
              onClick={() => nav({ pkind: value || null, pcount: null })}
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
          <div className="filter-controls">
            <select
              aria-label="筛选原型适配"
              value={device}
              onChange={(e) =>
                nav({ pdevice: e.target.value || null, pcount: null })
              }
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
              <p>项目在默认分支登记页面预览后，就会展示在这里。</p>
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
                  <p>调整类型或适配范围，查看其他页面与组件。</p>
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
                  onClick={() => nav({ pcount: String(limit + 24) }, true)}
                >
                  显示更多原型（已显示 {limit} / {rows.length}）
                </Button>
              )}
            </>
          )}
        </>
      </div>
      <PrototypeDetails catalog={catalog} />
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
  const publication = usePublication(
    item.id,
    revision,
    undefined,
    !!item.artifact,
  );
  const imageUrl = publicationThumbnail(publication.publication, device);
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
    <li className="prototype-tile" data-prototype-id={item.id}>
      <PrototypeThumbnail
        key={`${item.id}:${device ?? "component"}`}
        url={imageUrl}
        title={item.title}
        viewport={viewport}
        enabled={!!hasThumbnail}
        prepareError={publication.error}
        retryPrepare={publication.retry}
        open={open}
      />
      <div className="prototype-tile-body">
        <div className="prototype-tile-caption">
          <h2 aria-label={item.title}>
            <button
              className="prototype-title-open"
              aria-label={`查看原型详情：${item.title}`}
              onClick={() => nav({ ...clearPreview, pdetail: item.id })}
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
  large = false,
  prepareError,
  retryPrepare,
}: {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  enabled: boolean;
  open?: () => void;
  large?: boolean;
  prepareError?: string;
  retryPrepare?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(large),
    [state, setState] = useState<{
      key: string;
      status: "loading" | "ready" | "error";
    }>({ key: "", status: "loading" }),
    [attempt, setAttempt] = useState(0);
  const imageKey = `${url}:${attempt}`;
  const status = prepareError
    ? "error"
    : state.key === imageKey
      ? state.status
      : "loading";
  const setStatus = (status: "loading" | "ready" | "error") =>
    setState({ key: imageKey, status });
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
  }, [enabled, visible, status, imageKey]);
  const screenshot = enabled && visible && url && status !== "error" && (
    <img
      key={imageKey}
      src={`${url}${url.includes("?") ? "&" : "?"}attempt=${attempt}`}
      alt={`${title}的${large ? "大图" : "首屏截图"}`}
      referrerPolicy="no-referrer"
      width={viewport.width}
      height={viewport.height}
      onLoad={() => setStatus("ready")}
      onError={() => setStatus("error")}
    />
  );
  return (
    <div
      className={`prototype-thumbnail ${large ? "prototype-detail-image" : ""} ${status}`}
      style={
        large
          ? { aspectRatio: `${viewport.width} / ${viewport.height}` }
          : undefined
      }
      ref={root}
    >
      {open ? (
        <button
          className="prototype-thumbnail-open"
          aria-label={`预览${title}`}
          onClick={open}
        >
          {screenshot}
        </button>
      ) : (
        screenshot
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
                retryPrepare?.();
              }}
            >
              重试截图
            </Button>
          ) : (
            !enabled &&
            open && (
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

function PrototypeDetails({
  catalog,
  error,
}: {
  catalog?: PrototypeCatalog;
  error?: string;
}) {
  const { q, nav } = useWorkspace();
  const focus = useRef<HTMLElement | null>(null);
  const item = catalog?.items.find((row) => row.id === q.pdetail);
  return (
    <Dialog.Root
      open={!!q.pdetail}
      onOpenChange={(open) => {
        if (!open) nav({ pdetail: null });
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="change-drawer prototype-detail-drawer"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            focus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target =
              focus.current?.isConnected && focus.current !== document.body
                ? focus.current
                : document.querySelector<HTMLElement>(
                    ".prototype-gallery-heading h1",
                  );
            target?.focus({ preventScroll: true });
          }}
        >
          <div className="drawer-toolbar">
            <span>
              <PanelsTopLeft size={15} />
              原型详情
            </span>
            <Dialog.Close asChild>
              <IconButton aria-label="关闭原型详情">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="prototype-detail-scroll">
            {item && catalog?.revision ? (
              <PrototypeDetailBody
                key={item.id}
                item={item}
                revision={catalog.revision}
              />
            ) : (
              <div className="prototype-detail-empty">
                <Dialog.Title>
                  {error
                    ? "原型详情读取失败"
                    : !catalog
                      ? "正在读取原型详情…"
                      : "未找到此原型"}
                </Dialog.Title>
                <p>
                  {error ??
                    (catalog
                      ? "这个入口已不在默认分支的当前清单中。关闭详情后可查看其他原型。"
                      : "请稍候")}
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function PrototypeDetailBody({
  item,
  revision,
}: {
  item: PrototypeItem;
  revision: string;
}) {
  const { projectId, q, nav } = useWorkspace();
  const [selectedDevice, setSelectedDevice] = useState(q.pdevice);
  const { device, viewport } = previewViewport(item, selectedDevice);
  const params = new URLSearchParams({ revision });
  if (device) params.set("device", device);
  const publication = usePublication(
    item.id,
    revision,
    undefined,
    !!item.artifact,
  );
  const imageUrl = publicationThumbnail(publication.publication, device);
  const hasThumbnail =
    item.artifact?.type === "git" ||
    (item.artifact?.type === "hosted" &&
      item.artifact.thumbnails?.some((t) => t.device === device));
  return (
    <>
      <div className="prototype-detail-heading">
        <span className="eyebrow">
          {item.kind === "page" ? "页面" : "组件"}
        </span>
        <Dialog.Title>{item.title}</Dialog.Title>
        {item.description && <p>{item.description}</p>}
      </div>
      <div className="prototype-detail-actions">
        {item.devices ? (
          <select
            aria-label="详情截图设备"
            value={device}
            onChange={(event) => setSelectedDevice(event.target.value)}
          >
            {item.devices.map((value) => (
              <option key={value} value={value}>
                {DEVICE_LABELS[value]}
              </option>
            ))}
          </select>
        ) : (
          <span>自定义组件</span>
        )}
        <span className="prototype-detail-size">
          {viewport.width} × {viewport.height}
        </span>
        <Button
          onClick={() =>
            nav({
              ...clearPreview,
              prototype: item.id,
              preview: item.id,
              revision,
              device: device ?? null,
            })
          }
        >
          进入预览
        </Button>
      </div>
      <PrototypeThumbnail
        key={`${item.id}:${device ?? "component"}`}
        url={imageUrl}
        title={item.title}
        viewport={viewport}
        enabled={!!hasThumbnail}
        prepareError={publication.error}
        retryPrepare={publication.retry}
        large
      />
      <dl className="prototype-detail-source">
        <div>
          <dt>源码位置</dt>
          <dd>
            <code>{item.sourcePath}</code>
          </dd>
        </div>
        <div>
          <dt>源码提交</dt>
          <dd>
            <code>{item.artifact?.sourceCommit ?? "尚未发布产物"}</code>
          </dd>
        </div>
        <div>
          <dt>默认分支清单提交</dt>
          <dd>
            <code>{revision}</code>
          </dd>
        </div>
        <div>
          <dt>预览产物</dt>
          <dd>
            <code>
              {item.artifact?.type === "hosted"
                ? item.artifact.url
                : (item.artifact?.path ?? "尚未发布")}
            </code>
          </dd>
        </div>
        {item.artifact?.type === "hosted" && (
          <div>
            <dt>产物版本</dt>
            <dd>
              <code>{item.artifact.version}</code>
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}
