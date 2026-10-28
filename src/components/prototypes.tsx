"use client";
import { usePublication, publicationThumbnail } from "./publication";
import {
  Badge,
  Button,
  IconButton,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@open-folio/ui";
import { useEffect, useRef, useState } from "react";
import {
  Globe,
  ImageOff,
  LoaderCircle,
  PanelsTopLeft,
  X,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import { PublicLinkPopover } from "./public-link-popover";
import { legacyPrototypesPatch } from "@/lib/legacy-query";
import { primaryRecord } from "@/lib/model";
import styles from "./prototypes.module.css";
const prototypeClass = (names: string) =>
  names
    .split(/\s+/)
    .map((name) => styles[name])
    .filter(Boolean)
    .join(" ");
const deviceItems = [
  {
    value: "pc-web",
    label: (
      <>
        <Monitor />
        <span>PC Web</span>
      </>
    ),
  },
  {
    value: "ipad",
    label: (
      <>
        <Tablet />
        <span>iPad</span>
      </>
    ),
  },
  {
    value: "mobile",
    label: (
      <>
        <Smartphone />
        <span>手机</span>
      </>
    ),
  },
];
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
  const { data, projectId, q, readUrl, nav, cache } = useWorkspace();
  useEffect(() => {
    const patch = {
      ...(legacyPrototypesPatch(q) ?? {}),
      ...(q.pdevice && !["pc-web", "ipad", "mobile"].includes(q.pdevice)
        ? { pdevice: null }
        : {}),
    };
    if (Object.keys(patch).length) nav(patch, true);
  }, [q, nav]);
  const previous = useRef("");
  useEffect(() => {
    if (q.prototype) previous.current = q.prototype;
  }, [q.prototype]);
  const key = readUrl(`prototypes?snapshot=${data!.id}`);
  useEffect(() => cache.watchCatalog(readUrl), [cache, readUrl]);
  const [response, setResponse] = useState<{
    key: string;
    cache?: typeof cache;
    value?: PrototypeCatalog;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (cache.get<PrototypeCatalog>(key)) return;
    const controller = new AbortController();
    cache
      .readCatalog(data!.id, readUrl, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResponse({ key, cache, value });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResponse({ key, cache, error: error.message });
      });
    return () => controller.abort();
  }, [key, retry, cache, data!.id, readUrl]);
  const catalog =
    cache.get<PrototypeCatalog>(key) ??
    (response.key === key && response.cache === cache
      ? response.value
      : undefined);
  const error =
    response.key === key && response.cache === cache
      ? response.error
      : undefined;
  if (q.prototype)
    return (
      <>
        <ChangePreviews current />
        <PrototypeDetails catalog={catalog} error={error} />
      </>
    );
  // Restore scroll only after the complete list exists; keep the fetched catalog
  // in this parent while the viewer temporarily replaces the gallery.
  if (!catalog)
    return (
      <section
        className={prototypeClass("prototypes-workspace")}
        aria-label="项目原型总览"
      >
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
        tile?.querySelector("[data-prototype-cover]") as HTMLElement | null
      )?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [catalog, restoreId]);
  const device = ["pc-web", "ipad", "mobile"].includes(q.pdevice)
    ? q.pdevice
    : "pc-web";
  const items = catalog.items;
  const rows = items.filter(
    (item) =>
      item.kind === "component" || item.devices?.some((d) => d === device),
  );
  const requestedLimit = Number(q.pcount);
  const limit =
    Number.isSafeInteger(requestedLimit) && requestedLimit > 24
      ? Math.min(requestedLimit, Math.max(24, rows.length))
      : 24;
  return (
    <section
      className={prototypeClass("prototypes-workspace")}
      aria-label="项目原型总览"
      ref={scroll}
    >
      <div className={prototypeClass("gallery-inner")}>
        <header className={prototypeClass("prototype-gallery-heading")}>
          <div>
            <h1 tabIndex={-1} data-prototype-gallery-title>
              原型
            </h1>
            <p>{items.length} 个当前入口</p>
          </div>
        </header>
        <div className={prototypeClass("prototype-catalog-controls")}>
          <SegmentedControl
            label="预览设备"
            value={device}
            onValueChange={(value) => nav({ pdevice: value, pcount: null })}
            items={deviceItems}
          />
        </div>
        <div className={prototypeClass("prototype-gallery-scroll")}>
          <>
            {catalog.message && (
              <div className={prototypeClass("prototype-policy")} role="status">
                <p>{catalog.message}</p>
              </div>
            )}
            {!!catalog.issues.length && (
              <details className={prototypeClass("prototype-issues")}>
                <summary>{catalog.issues.length} 项清单内容需检查</summary>
                <ul>
                  {catalog.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
            {!items.length ? (
              <Empty
                title="这个仓库还没有原型"
                icon={<PanelsTopLeft size={28} />}
              >
                <p>项目在集成分支登记页面预览后，就会展示在这里。</p>
              </Empty>
            ) : (
              <>
                <div className={prototypeClass("prototype-result-line")}>
                  <span aria-live="polite">
                    {`${rows.length} 个适配${DEVICE_LABELS[device as keyof typeof DEVICE_LABELS]}的入口`}
                  </span>
                </div>
                {!rows.length ? (
                  <Empty title="没有匹配的原型">
                    <p>切换预览设备，查看其他页面与组件。</p>
                  </Empty>
                ) : (
                  <ul
                    className={prototypeClass("prototype-grid")}
                    aria-label="项目原型列表"
                  >
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
                    className={prototypeClass("prototype-load-more")}
                    onClick={() => nav({ pcount: String(limit + 24) }, true)}
                  >
                    显示更多原型（已显示 {limit} / {rows.length}）
                  </Button>
                )}
              </>
            )}
          </>
        </div>
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
  const { nav, q, data } = useWorkspace();
  const { device, viewport } = previewViewport(item, q.pdevice);
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
  const hasThumbnail = !!item.artifact;
  return (
    <li
      className={prototypeClass("prototype-tile")}
      data-prototype-id={item.id}
    >
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
      <button
        className={prototypeClass("prototype-tile-body")}
        aria-label={`查看原型详情：${item.title}`}
        aria-haspopup="dialog"
        onClick={() => nav({ ...clearPreview, pdetail: item.id })}
      >
        <span
          className={prototypeClass("prototype-tile-caption")}
          role="heading"
          aria-level={2}
          aria-label={item.title}
        >
          <span className={prototypeClass("prototype-title-open")}>
            {item.title}
          </span>
          {item.kind === "component" && <Badge>组件</Badge>}
        </span>
        <span
          className={prototypeClass("prototype-description")}
          data-prototype-description
        >
          {item.description ??
            (item.artifact ? "打开查看页面与交互细节" : "尚未发布预览")}
        </span>
        <span className={prototypeClass("prototype-card-meta")}>
          <span>
            {item.devices?.map((d) => DEVICE_LABELS[d]).join(" · ") ??
              `${viewport.width} × ${viewport.height}`}
          </span>
          {prototypeChanges(data?.changes ?? [], item)
            .slice(0, 1)
            .map((change) => (
              <span
                className={prototypeClass("prototype-change")}
                key={change.id}
              >
                {change.title}
              </span>
            ))}
          {publication.url && <Globe aria-label="公开链接已准备" />}
        </span>
      </button>
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
      className={prototypeClass(
        `prototype-thumbnail ${large ? "prototype-detail-image" : ""} ${status}`,
      )}
      style={
        large
          ? { aspectRatio: `${viewport.width} / ${viewport.height}` }
          : undefined
      }
      ref={root}
      data-thumbnail-status={status}
    >
      {open ? (
        <button
          className={prototypeClass("prototype-thumbnail-open")}
          data-prototype-cover
          aria-label={`预览${title}`}
          onClick={open}
        >
          {screenshot}
        </button>
      ) : (
        screenshot
      )}
      {(!enabled || status !== "ready") && (
        <div
          className={prototypeClass("prototype-thumbnail-state")}
          role="status"
        >
          {enabled && status === "loading" ? (
            <LoaderCircle size={20} className={prototypeClass("spin")} />
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
    <Sheet
      open={!!q.pdetail}
      onOpenChange={(open) => {
        if (!open) nav({ pdetail: null });
      }}
    >
      <SheetContent
        className={styles.detailSheet}
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
                  "[data-prototype-gallery-title]",
                );
          target?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle>原型详情</SheetTitle>
          <IconButton
            aria-label="关闭原型详情"
            onClick={() => nav({ pdetail: null })}
          >
            <X />
          </IconButton>
        </SheetHeader>
        <SheetBody>
          {item && catalog?.revision ? (
            <PrototypeDetailBody
              key={item.id}
              item={item}
              revision={catalog.revision}
            />
          ) : (
            <div className={prototypeClass("prototype-detail-empty")}>
              <h2>
                {error
                  ? "原型详情读取失败"
                  : !catalog
                    ? "正在读取原型详情…"
                    : "未找到此原型"}
              </h2>
              <p>
                {error ??
                  (catalog
                    ? "这个入口已不在集成分支的当前清单中。关闭详情后可查看其他原型。"
                    : "请稍候")}
              </p>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
function PrototypeDetailBody({
  item,
  revision,
}: {
  item: PrototypeItem;
  revision: string;
}) {
  const { q, nav, data } = useWorkspace();
  const [selectedDevice, setSelectedDevice] = useState(q.pdevice);
  const { device, viewport } = previewViewport(item, selectedDevice);
  const publication = usePublication(
    item.id,
    revision,
    undefined,
    !!item.artifact,
  );
  const imageUrl = publicationThumbnail(publication.publication, device);
  const hasThumbnail = !!item.artifact;
  return (
    <>
      <div className={prototypeClass("prototype-detail-heading")}>
        <span className={prototypeClass("eyebrow")}>
          {item.kind === "page" ? "页面" : "组件"}
        </span>
        <h2>{item.title}</h2>
        {item.description && <p>{item.description}</p>}
      </div>
      <div className={prototypeClass("prototype-detail-actions")}>
        {item.devices ? (
          <SegmentedControl
            label="详情截图设备"
            value={device ?? item.devices[0]}
            onValueChange={setSelectedDevice}
            items={item.devices.map((value) => ({
              value,
              label: DEVICE_LABELS[value],
            }))}
          />
        ) : (
          <span>自定义组件</span>
        )}
        <span className={prototypeClass("prototype-detail-size")}>
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
      <dl
        className={prototypeClass("prototype-detail-source")}
        aria-label="原型来源"
      >
        <div>
          <dt>关联 Change</dt>
          <dd>
            {prototypeChanges(data?.changes ?? [], item).length
              ? prototypeChanges(data?.changes ?? [], item).map((change) => (
                  <Button
                    variant="text"
                    key={change.id}
                    onClick={() =>
                      nav({ ...clearPreview, m: "changes", c: change.id })
                    }
                  >
                    {change.title}
                  </Button>
                ))
              : "尚无关联记录"}
          </dd>
        </div>
        <div>
          <dt>公开链接</dt>
          <dd>
            {publication.url
              ? "已准备"
              : publication.error
                ? "准备失败"
                : item.artifact
                  ? "正在准备…"
                  : "尚未发布"}
          </dd>
        </div>
        <div>
          <dt>源码位置</dt>
          <dd>
            <code>{item.sourcePath}</code>
          </dd>
        </div>
        <div>
          <dt>
            {item.artifact?.source
              ? "源码提交（原型仓库）"
              : item.source?.links.length
                ? "构建基线提交（主仓库）"
                : "源码提交"}
          </dt>
          <dd>
            <code>{item.artifact?.sourceCommit ?? "尚未发布产物"}</code>
          </dd>
        </div>
        <div>
          <dt>集成分支清单提交</dt>
          <dd>
            <code>{revision}</code>
          </dd>
        </div>
        {item.source?.links.map((link) => (
          <div key={link.path}>
            <dt>清单子模块 {link.path}</dt>
            <dd>
              <code>
                {link.repository} · {link.commit}
              </code>
            </dd>
          </div>
        ))}
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
      <PublicLinkPopover
        url={publication.url}
        error={publication.error}
        retry={publication.retry}
        device={device}
        disabled={!item.artifact}
      />
    </>
  );
}

function prototypeChanges(
  changes: import("@/lib/model").ChangeGroup[],
  item: PrototypeItem,
) {
  const artifact = item.artifact;
  if (!artifact) return [];
  return changes.filter((group) =>
    primaryRecord(group)?.state?.previews?.some((preview) => {
      const other = preview.artifact;
      return (
        other &&
        preview.id === item.id &&
        other.sourceCommit === artifact.sourceCommit &&
        other.source?.repository === artifact.source?.repository &&
        other.source?.packagePath === artifact.source?.packagePath &&
        (other.type === "hosted" && artifact.type === "hosted"
          ? other.version === artifact.version
          : other.type === "git" &&
            artifact.type === "git" &&
            other.path === artifact.path)
      );
    }),
  );
}
