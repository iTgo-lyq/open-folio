"use client";
import { useEffect } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FileText,
  Info,
  ListChecks,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react";
import { Avatar, Badge, Button, IconButton } from "@open-folio/ui";
import { primaryRecord, type ChangeGroup, type Heading } from "@/lib/model";
import {
  changeMaterials,
  currentMaterial,
  type ChangeMaterial,
} from "@/lib/change-reading";
import {
  filterDirectoryChanges,
  readDirectoryQuery,
  sortDirectoryChanges,
  groupDirectoryChanges,
} from "@/lib/change-directory";
import { matchingFollowUps } from "@/lib/follow-ups";
import { archiveTimeline } from "@/lib/archive-timeline";
import { STAGES } from "@/lib/model";
import { useDocument, useWorkspace } from "./context";
import { Reader } from "./reader";
import { ReadingDocument } from "./reading-document";
import { ChangeDetails, Flow, quality } from "./change-materials";
import { ChangeLabels } from "./change-labels";
import { ShareManager } from "./share-manager";
import { Empty } from "./document";
import { ToolbarSlot } from "./toolbar-slot";
import { sectionId } from "./material-styles";
import { usePersonal } from "./personal-context";
import { useMediaQuery } from "./use-media";
import styles from "./change-reading.module.css";
import page from "./personal.module.css";

const materialIcon = (id: string) =>
  id === "overview"
    ? Info
    : id === "tasks"
      ? ListChecks
      : id === "prototypes"
        ? PanelsTopLeft
        : id === "evidence"
          ? ShieldCheck
          : FileText;

export function ChangeReading({
  group,
  onBack,
  banner,
}: {
  group?: ChangeGroup;
  onBack?: () => void;
  banner?: React.ReactNode;
}) {
  const { data, q, nav, projectId, sharing } = useWorkspace();
  const g = group ?? data?.changes.find((change) => change.id === q.c),
    record = g && primaryRecord(g),
    state = record?.state;
  const items = g
    ? changeMaterials(g, data!.documents, !!data?.integrations.records[g.id])
    : [];
  const material = items.length ? currentMaterial(items, q) : undefined;
  const doc = material?.document;
  const { value, error, loading } = useDocument(doc?.id);
  const mobile = useMediaQuery("(max-width: 760px)");
  useEffect(() => {
    if (!material) return;
    if (q.doc && doc?.id === q.doc)
      nav({ ct: material.id, doc: null, da: null, anchor: q.da ?? null }, true);
    else if (q.ct && q.ct !== material.id && !q.document)
      nav({ ct: material.id }, true);
  }, [material?.id, q.doc, q.ct, q.document, doc?.id]);
  const select = (item: ChangeMaterial) =>
    nav({
      ct: item.id,
      doc: null,
      document: sharing ? (item.file ?? null) : null,
      da: null,
      anchor: null,
      raw: null,
      preview: null,
      cf: null,
      cv: null,
    });
  const identity = usePersonal()?.connection?.identity;
  const query = readDirectoryQuery(q);
  const timeline = query.scope === "archived" && !query.issues;
  const visible = sortDirectoryChanges(
    filterDirectoryChanges(
      data?.changes ?? [],
      query,
      data?.deliveryByChange,
      identity,
    ),
    !timeline && query.labels.sortByUrgency,
  );
  const bins =
    query.view === "board" &&
    query.scope === "active" &&
    !query.issues &&
    !mobile
      ? STAGES.map((stage) => ({
          items: visible.filter(
            (group) => primaryRecord(group)?.state?.stage === stage,
          ),
        }))
      : groupDirectoryChanges(visible, query, data?.deliveryByChange);
  const ordered = timeline
    ? archiveTimeline(visible, data?.deliveryByChange).flatMap((day) =>
        day.batches.flatMap((batch) => batch.items),
      )
    : bins.flatMap((bin) =>
        [
          ...matchingFollowUps(data?.changes ?? [], bin.items).visible.values(),
        ].flat(),
      );
  const position = ordered.findIndex((change) => change.id === g?.id);
  const step = (offset: number) => {
    const target = ordered[position + offset];
    if (target)
      nav({
        c: target.id,
        ct: material?.id ?? "overview",
        doc: null,
        da: null,
        anchor: null,
        raw: null,
        preview: null,
        cf: null,
        cv: null,
      });
  };
  const overviewHeadings: Heading[] = [];
  const heading = (text: string, id = sectionId(text)) =>
    overviewHeadings.push({ id, text, depth: 2, line: 0 });
  if (material?.id === "overview") {
    if (state?.status === "active" && record) heading("进度");
    if (g && data?.deliveryByChange?.[g.id]) heading("交付进度", "delivery");
    if (
      g &&
      (g.relations.length ||
        record?.relatedSpecs.length ||
        state?.followUpOf ||
        data?.changes.some(
          (change) => primaryRecord(change)?.state?.followUpOf === g.id,
        ))
    )
      heading("关联");
    if (Object.keys(state?.clarifications ?? {}).length) heading("澄清问答");
    if (state?.rework) heading("最近返工");
  }
  const headings = doc
    ? doc.headings.filter((heading) => heading.depth > 1)
    : overviewHeadings;
  let section: string | undefined;
  const MaterialIcon = materialIcon(material?.id ?? "");
  const pane = (
    <nav aria-label="Change 材料">
      <ul className={styles.materials}>
        {items.map((item) => {
          const showSection = item.section && item.section !== section;
          section = item.section;
          const Icon = materialIcon(item.id);
          return (
            <li key={item.id}>
              {showSection && (
                <div className={styles.materialGroup}>{item.section}</div>
              )}
              <a
                className={styles.materialLink}
                href={`?${new URLSearchParams({ ...q, ct: item.id, ...(sharing ? { document: item.file ?? "" } : {}) })}`}
                aria-current={material?.id === item.id ? "page" : undefined}
                data-absent={!!item.unavailable || undefined}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  select(item);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item.title}</span>
                {item.missing ? (
                  <small className={styles.missing}>缺失</small>
                ) : item.unavailable ? (
                  <small>未产生</small>
                ) : item.document && !item.document.readable ? (
                  <small className={styles.missing}>不可读</small>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  const back = () =>
    onBack
      ? onBack()
      : nav({
          c: null,
          ct: null,
          doc: null,
          da: null,
          anchor: null,
          raw: null,
          preview: null,
          cf: null,
          cv: null,
        });
  return (
    <>
      {!sharing && (
        <>
          <ToolbarSlot side="left">
            <Button
              variant="ghost"
              size="sm"
              className={styles.backButton}
              aria-label="返回 Changes 列表"
              onClick={back}
            >
              <ArrowLeft />
              <span className={styles.backLabel}>Changes</span>
            </Button>
          </ToolbarSlot>
          <ToolbarSlot side="right">
            {!mobile && (
              <>
                <IconButton
                  aria-label="上一个 Change"
                  disabled={position <= 0}
                  tooltip
                  onClick={() => step(-1)}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  aria-label="下一个 Change"
                  disabled={position < 0 || position >= ordered.length - 1}
                  tooltip
                  onClick={() => step(1)}
                >
                  <ArrowDown />
                </IconButton>
              </>
            )}
            {g && <ShareManager changeId={g.id} />}
          </ToolbarSlot>
        </>
      )}
      {!g || !material ? (
        <div className={page.page}>
          <div className={page.inner}>
            <Empty title="当前记录中没有这个 Change">
              <p>它可能已移动到其他分支，或尚未推送。</p>
              {!sharing && <Button onClick={back}>返回 Changes</Button>}
            </Empty>
          </div>
        </div>
      ) : (
        <Reader
          paneLabel="Change 材料"
          paneTitle={g.title}
          current={{
            icon: <MaterialIcon aria-hidden="true" />,
            title: material.title,
          }}
          pane={pane}
          headings={headings}
          pageKey={`${projectId}.${g.id}.${material.id}.${doc?.branch ?? record?.branch}`}
          anchor={q.anchor}
          onAnchor={(anchor) => nav({ anchor })}
          ready={!doc || !!value}
          wide={material.id === "integration" || material.id === "prototypes"}
        >
          {banner}
          {material.id === "overview" ? (
            <header className={styles.header}>
              <code>{g.id}</code>
              <h1>{g.title}</h1>
              <div className={styles.facts}>
                {g.creator && (
                  <>
                    <Avatar name={g.creator.login ?? g.creator.name} />
                    <span>{g.creator.login ?? g.creator.name}</span>
                  </>
                )}
                {g.createdAt && (
                  <time dateTime={g.createdAt}>
                    创建于 {new Date(g.createdAt).toLocaleDateString("zh-CN")}
                  </time>
                )}
                {state && (
                  <>
                    <span>· {state.size}</span>
                    <span role="region" aria-label="类型与紧急程度">
                      <ChangeLabels state={state} detail />
                    </span>
                  </>
                )}
                {state?.status === "cancelled" && <Badge>已取消</Badge>}
                {quality(g).some((d) => d.severity === "error") && (
                  <Badge tone="warning">来源待核对</Badge>
                )}
              </div>
              {state && (
                <Flow
                  state={state}
                  relations={g.relations}
                  complete={!!record?.validCompleted}
                />
              )}
            </header>
          ) : (
            !doc && <h1 className={styles.title}>{material.title}</h1>
          )}
          {doc ? (
            <ReadingDocument value={value} error={error} loading={loading} />
          ) : material.file ? (
            <div
              className={styles.absent}
              role={material.missing ? "alert" : undefined}
            >
              <h2>
                {material.missing ? "文件缺失" : `还没有${material.title}`}
              </h2>
              <p>
                <code>{material.file}</code> ·{" "}
                {material.unavailable ??
                  "已进入需要该材料的阶段，但分支上没有找到文件。"}
              </p>
            </div>
          ) : (
            <ChangeDetails
              group={g}
              tab={material.id === "prototypes" ? "previews" : material.id}
            />
          )}
        </Reader>
      )}
    </>
  );
}
