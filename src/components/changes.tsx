"use client";
import { Badge as UiBadge, type BadgeTone } from "@open-folio/ui";
import { useEffect, useMemo, useRef } from "react";
import { Dialog } from "radix-ui";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  GitBranch,
  GitPullRequest,
  LayoutGrid,
  List,
  ListChecks,
  Network,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  primaryRecord,
  STAGES,
  STAGE_LABELS,
  STATUS_LABELS,
  TASK_LABELS,
  WAIT_LABELS,
  type ChangeCandidate,
  type ChangeGroup,
  type ChangeState,
  type Diagnostic,
  type Relation,
  type Task,
} from "@/lib/model";
import { useSavedScroll, useWorkspace } from "./context";
import { documentExpectation } from "@/lib/workflow";
import { Empty, Source, CopyPageLink } from "./document";
import { ChangePreviews } from "./previews";
import { ChangeDelivery, DeliveryBadge } from "./delivery";
import { ChangeIntegration } from "./integration";
import { GroupedChangeRows, FollowUpContext } from "./follow-ups";
import { ChangeLabels, ChangeLabelFilters } from "./change-labels";
import { ShareManager } from "./share-manager";
import { ChangeDirectory } from "./change-directory";
import {
  readLabelQuery,
  labelQueryParams,
  matchesLabels,
  sortByUrgency,
} from "@/lib/change-labels";
const sizes = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "XLarge",
};
export function quality(g: ChangeGroup) {
  const c = primaryRecord(g);
  return [
    ...g.diagnostics,
    ...(c?.diagnostics ?? []),
    ...(c?.taskGraph.diagnostics ?? []),
  ];
}
function stageText(s: ChangeState) {
  if (
    s.stage === "close" &&
    s.status === "active" &&
    s.closure.verification?.result === "passed" &&
    !s.closure.acceptance
  )
    return "验收中";
  return s.stage === "technical" && ["medium", "xlarge"].includes(s.size)
    ? "技术 · 计划"
    : STAGE_LABELS[s.stage];
}
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  const tones: Record<string, BadgeTone> = {
    execution: "info",
    doing: "info",
    active: "info",
    technical: "accent",
    plan: "accent",
    close: "success",
    done: "success",
    completed: "success",
    warning: "warning",
    blocked: "warning",
    cancelled: "danger",
  };
  return <UiBadge tone={tones[tone] ?? "neutral"}>{children}</UiBadge>;
}
function StateIcon({ status }: { status: string }) {
  return status === "done" || status === "completed" ? (
    <CheckCircle2 size={15} />
  ) : status === "doing" || status === "active" ? (
    <Circle size={15} className="active-ring" />
  ) : status === "blocked" ? (
    <AlertCircle size={15} />
  ) : (
    <Circle size={15} />
  );
}
function Progress({ c }: { c: ChangeCandidate }) {
  const { data, sharing } = useWorkspace(),
    s = c.state;
  if (!s) return <span className="muted">状态不可判定</span>;
  if (s.size === "xlarge" && sharing)
    return (
      <span className="task-progress">
        {s.children?.length ?? 0} 个子项 · 不在本页范围内
      </span>
    );
  if (s.size === "xlarge") {
    const children = s.children ?? [],
      resolved = children.filter((id) => {
        const g = data?.changes.find((g) => g.id === id),
          c = g && primaryRecord(g);
        return (
          c?.validCompleted ||
          (c?.state?.status === "cancelled" && !quality(g!).length)
        );
      }).length;
    return (
      <span className="task-progress">
        <Network size={13} />
        {resolved} / {children.length} 子项结束
      </span>
    );
  }
  const tasks = Object.values(s.tasks),
    done = tasks.filter((t) => t.status === "done").length;
  return (
    <span className="task-progress">
      <span className="progress-track">
        <span
          style={{
            width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
          }}
        />
      </span>
      {done} / {tasks.length}
    </span>
  );
}
export default function Changes() {
  return (
    <>
      <ChangeDirectory />
      <ChangeDrawer />
    </>
  );
}
function activeFlow(group: ChangeGroup) {
  return (
    primaryRecord(group)?.state?.status === "active" &&
    !quality(group).some((diagnostic) => diagnostic.severity === "error")
  );
}
function RelationRow({ relation: r }: { relation: Relation }) {
  const { data, nav, sharing } = useWorkspace(),
    target = data?.changes.find((g) => g.id === r.target);
  return (
    <div className="relation-row">
      <span className="relation-kind">
        {r.kind === "dependency"
          ? "前置"
          : r.kind === "child"
            ? "子项"
            : "父项"}
      </span>
      <ArrowRight size={13} />
      <button
        className="relation-target"
        disabled={!target}
        onClick={() =>
          nav({
            c: r.target,
            ct: "overview",
            preview: null,
            device: null,
            orientation: null,
            revision: null,
            zoom: null,
          })
        }
      >
        {target?.title ?? r.target}
        <code>{r.target}</code>
        {sharing && !target && <small>不在本页范围内</small>}
      </button>
      <div className="relation-evidence">
        {r.kind !== "parent" && (
          <>
            <Badge tone={r.process === "satisfied" ? "done" : "warning"}>
              流程
              {r.process === "satisfied"
                ? "已满足"
                : r.process === "unsatisfied"
                  ? "未满足"
                  : "未知"}
            </Badge>
            <span>
              {r.ancestry === "found" ? "已找到祖先提交" : "可用性待核实"}
            </span>
          </>
        )}
        {r.diagnostics.map((d, i) => (
          <span className="warning-text" key={i}>
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
function TaskDependencies({ c }: { c: ChangeCandidate }) {
  const { openDocument } = useWorkspace(),
    g = c.taskGraph;
  return (
    <div className="task-dependencies">
      {g.status === "valid" && (
        <p className="muted">
          {g.source === "default"
            ? "默认按任务编号串行执行。"
            : "按 Plan 中的显式执行顺序执行。"}
        </p>
      )}
      {g.status === "valid" ? (
        Object.entries(g.edges).map(([id, prev]) => (
          <div className="task-edge" key={id}>
            <code>{prev.length ? prev.join(" + ") : "无前置"}</code>
            <ArrowRight size={13} />
            <strong>{id}</strong>
            <span>{c.state?.tasks[id]?.title}</span>
          </div>
        ))
      ) : (
        <p className="muted">
          {g.status === "not-applicable"
            ? "父 Change 按子项组织，不解析实现任务表。"
            : g.status === "missing"
              ? "缺少可读取的 Plan，无法核对执行安排。"
              : "执行顺序不可判定，请查看 Plan。"}
        </p>
      )}
      {g.diagnostics.map((d, i) => (
        <p className="warning-text" key={i}>
          {d.message}
          {d.line && `（第 ${d.line} 行）`}
        </p>
      ))}
      {g.documentId && (
        <button
          className="text-button"
          onClick={() => openDocument(g.documentId!)}
        >
          <FileText size={13} />
          查看 Plan 原文依据
        </button>
      )}
    </div>
  );
}
export function ChangeDrawer() {
  const { data, q, nav, openDocument } = useWorkspace(),
    focus = useRef<HTMLElement | null>(null),
    g = data?.changes.find((g) => g.id === q.c),
    c = g ? primaryRecord(g) : null,
    s = c?.state;
  const ongoing = !!g && activeFlow(g);
  const sourceIssue =
    !!g && quality(g).some((diagnostic) => diagnostic.severity === "error");
  const tab = [
    "overview",
    "tasks",
    "documents",
    "evidence",
    "previews",
    "integration",
  ].includes(q.ct)
    ? q.ct
    : "overview";
  return (
    <Dialog.Root
      open={!!q.c}
      onOpenChange={(open) => {
        if (!open)
          nav({
            c: null,
            ct: null,
            preview: null,
            device: null,
            orientation: null,
            revision: null,
            zoom: null,
            cf: null,
            cv: null,
          });
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className={`change-drawer${tab === "previews" ? " with-preview" : tab === "integration" ? " with-integration" : ""}`}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            focus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (focus.current?.isConnected) focus.current.focus();
          }}
        >
          <div className="drawer-toolbar">
            <span>
              <GitPullRequest size={15} />
              Change 详情
            </span>
            <div className="row">
              {g && c && <ShareManager changeId={g.id} />}
              <CopyPageLink />
              <Dialog.Close className="icon-button" aria-label="关闭变更详情">
                <X size={19} />
              </Dialog.Close>
            </div>
          </div>
          <div className="drawer-summary">
            <code className="drawer-id">{g?.id ?? q.c}</code>
            <Dialog.Title>{g?.title ?? "未找到此 Change"}</Dialog.Title>
            <div className="drawer-badges">
              {s ? (
                <>
                  <Badge tone={sourceIssue ? "warning" : s.status}>
                    {sourceIssue
                      ? "来源待核对"
                      : c?.validCompleted
                        ? "已归档"
                        : STATUS_LABELS[s.status]}
                  </Badge>
                  <Badge>{sizes[s.size]}</Badge>
                  {ongoing && <Badge tone={s.stage}>{stageText(s)}</Badge>}
                </>
              ) : (
                <Badge tone="warning">来源待核对</Badge>
              )}
              {g && quality(g).length > 0 && (
                <Badge tone="warning">{quality(g).length} 项来源提示</Badge>
              )}
            </div>
            {s && ongoing && <Flow state={s} relations={g!.relations} />}
          </div>
          <div
            className="drawer-tabs"
            role="tablist"
            aria-label="Change 详情页签"
          >
            {[
              ["overview", "概览"],
              ["tasks", s?.size === "xlarge" ? "子项" : "任务"],
              ["documents", "文档"],
              ["previews", "原型"],
              ["integration", "合入变更"],
              ["evidence", "依据"],
            ].map(([id, title]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                key={id}
                onClick={() => nav({ ct: id })}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const buttons = [
                    ...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    ),
                  ];
                  const index = buttons.indexOf(event.currentTarget);
                  const next =
                    event.key === "Home"
                      ? buttons[0]
                      : event.key === "End"
                        ? buttons.at(-1)!
                        : buttons[
                            (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              buttons.length) %
                              buttons.length
                          ];
                  next.focus();
                  next.click();
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="drawer-body" key={`${g?.id}.${tab}`}>
            <ChangeDetails group={g} tab={tab} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ChangeDetails({
  group: g,
  tab,
}: {
  group?: ChangeGroup;
  tab: string;
}) {
  const { data, nav, openDocument } = useWorkspace();
  const c = g ? primaryRecord(g) : null,
    s = c?.state;
  const ongoing = !!g && activeFlow(g);
  return (
    <>
      {g && (!c || ["overview", "evidence"].includes(tab)) && (
        <EntrySource group={g} />
      )}
      {!g ? (
        <Empty title="当前记录中没有这个 Change">
          <p>它可能已移动到其他分支，或尚未推送。</p>
        </Empty>
      ) : tab === "integration" ? (
        <ChangeIntegration key={`${data!.id}:${g.id}`} id={g.id} />
      ) : !c ? (
        <>
          <Diagnostics items={g.diagnostics} />
          <CandidateSources group={g} />
        </>
      ) : tab === "previews" ? (
        <ChangePreviews change={c} />
      ) : tab === "documents" ? (
        <DocumentList c={c} />
      ) : tab === "evidence" ? (
        <Evidence c={c} group={g} />
      ) : tab === "tasks" ? (
        s?.size === "xlarge" ? (
          <>
            <SectionTitle>子 Change</SectionTitle>
            {g.relations
              .filter((r) => r.kind === "child")
              .map((r, i) => (
                <RelationRow key={i} relation={r} />
              ))}
            {!s.children?.length && <p className="muted">尚未声明子项。</p>}
            <p className="subtle-note">
              展示顺序不代表执行依赖；每个子 Change 独立验收。
            </p>
          </>
        ) : (
          <TaskDetails c={c} />
        )
      ) : (
        <>
          <Diagnostics items={quality(g)} />
          <FollowUpContext change={g} />
          <ChangeDelivery id={g.id} />
          {s && (
            <section
              className="change-label-details"
              aria-label="类型与紧急程度"
            >
              <SectionTitle>类型与紧急程度</SectionTitle>
              <ChangeLabels state={s} detail />
            </section>
          )}
          {ongoing && s?.waitingFor && (
            <div className="waiting-card">
              <Clock3 size={17} />
              <div>
                <strong>{WAIT_LABELS[s.waitingFor.kind]}</strong>
                <p>{s.waitingFor.summary}</p>
              </div>
            </div>
          )}
          {s?.cancellation && (
            <div className="waiting-card cancelled">
              <X size={17} />
              <div>
                <strong>该 Change 已取消</strong>
                <p>{s.cancellation.reason}</p>
                <time>{formatTime(s.cancellation.at)}</time>
              </div>
            </div>
          )}
          {s && c.validCompleted && (
            <div className="archive-outcome">
              <CheckCircle2 size={18} />
              <div>
                <strong>交付已归档</strong>
                <p>{s.closure.acceptance?.summary}</p>
                <time dateTime={s.closure.archive!.at}>
                  归档于 {formatTime(s.closure.archive!.at)}
                </time>
                <button
                  className="text-button"
                  onClick={() => nav({ ct: "evidence" })}
                >
                  查看验收依据 <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
          <SectionTitle>目标与材料</SectionTitle>
          <p className="subtle-note">目标和验收以 Requirement 正文为准。</p>
          <DocumentList c={c} shortlist />
          <Clarifications items={s?.clarifications} />
          {s && ongoing && (
            <>
              <SectionTitle>
                {s.size === "xlarge" ? "子项进展" : "任务进展"}
              </SectionTitle>
              <div className="overview-progress">
                <Progress c={c} />
                <button
                  className="text-button"
                  onClick={() => nav({ ct: "tasks" })}
                >
                  查看{s.size === "xlarge" ? "子项" : "任务"}
                  <ChevronRight size={12} />
                </button>
              </div>
            </>
          )}
          {g.relations.length > 0 && (
            <>
              <SectionTitle>Change 关系</SectionTitle>
              {g.relations.map((r, i) => (
                <RelationRow key={i} relation={r} />
              ))}
            </>
          )}
          {c.relatedSpecs.length > 0 && (
            <>
              <SectionTitle>显式关联能力</SectionTitle>
              <div className="related-specs">
                {c.specReferences.map((ref, i) => (
                  <button key={i} onClick={() => openDocument(ref.documentId)}>
                    <BookIcon />
                    <span>
                      {ref.specId}
                      <small>引用文档 · 第 {ref.line} 行</small>
                    </span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            </>
          )}
          {s?.rework && (
            <>
              <SectionTitle>最近返工</SectionTitle>
              <div className="evidence-card">
                <time>{formatTime(s.rework.at)}</time>
                <p>{s.rework.reason}</p>
                <p>{s.rework.approach}</p>
              </div>
            </>
          )}
          {s &&
            ongoing &&
            (s.stage === "close" || Object.keys(s.closure).length > 0) && (
              <Closure state={s} />
            )}
          <SectionTitle>主来源</SectionTitle>
          <Source
            document={data!.documents.find((d) => d.id === c.jsonDocumentId)!}
          />
        </>
      )}
    </>
  );
}
const BookIcon = () => <FileText size={15} />;
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="section-title">{children}</h3>;
}
function Clarifications({ items }: { items: ChangeState["clarifications"] }) {
  const entries = Object.entries(items ?? {}).sort(([a], [b]) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  if (!entries.length) return null;
  return (
    <section aria-label="澄清问答">
      <SectionTitle>澄清问答</SectionTitle>
      <dl className="clarification-list">
        {entries.map(([id, item]) => (
          <div className="clarification-item" key={id}>
            <dt>
              <code className="clarification-id">{id}</code>
              <span className="clarification-question">
                {item.question}
                {item.withdrawn && (
                  <span className="clarification-status">已撤回</span>
                )}
              </span>
            </dt>
            <dd className={item.answer ? undefined : "clarification-pending"}>
              {item.answer ?? "未回答"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function formatTime(at: string) {
  if (Number.isNaN(new Date(at).getTime())) return at;
  return new Date(at).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}
function Flow({
  state: s,
  relations,
}: {
  state: ChangeState;
  relations: Relation[];
}) {
  const tasks = Object.values(s.tasks),
    children = s.children ?? [],
    executionDone =
      ["execution", "close"].includes(s.stage) &&
      (s.size === "xlarge"
        ? children.length > 0 &&
          children.every((id) =>
            relations.some(
              (r) =>
                r.kind === "child" &&
                r.target === id &&
                r.process === "satisfied",
            ),
          )
        : tasks.length > 0 && tasks.every((t) => t.status === "done"));
  const route =
    s.size === "small"
      ? [
          { id: "requirement", label: "需求", keys: [] },
          { id: "execution", label: "执行", keys: [] },
          { id: "close", label: STAGE_LABELS.close, keys: [] },
        ]
      : s.size === "large"
        ? STAGES.map((id) => ({ id, label: STAGE_LABELS[id], keys: [id] }))
        : [
            { id: "requirement", label: "需求", keys: ["requirement"] },
            {
              id: "technical",
              label: "技术 · 计划",
              keys: ["technical", "plan"],
            },
            { id: "execution", label: "执行", keys: [] },
            { id: "close", label: STAGE_LABELS.close, keys: [] },
          ];
  return (
    <div className="stage-flow">
      {route.map((v, i) => {
        const recorded =
          v.id === "execution"
            ? executionDone
            : v.keys.length > 0 &&
              v.keys.every(
                (k) => s.confirmations[k as keyof ChangeState["confirmations"]],
              );
        return (
          <div
            className={`${v.id === s.stage ? "current" : ""} ${recorded ? "recorded" : ""}`}
            key={v.id}
          >
            <span className="flow-dot">
              {recorded ? <Check size={10} /> : i + 1}
            </span>
            <span>{v.label}</span>
            {i < route.length - 1 && <span className="flow-line" />}
          </div>
        );
      })}
    </div>
  );
}
function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (!items.length) return null;
  return (
    <div className="diagnostics">
      <strong>
        <AlertCircle size={14} />
        来源需要核对
      </strong>
      {items.map((d, i) => (
        <div key={i}>
          <p>{d.message}</p>
          {d.path && <code>{d.path}</code>}
        </div>
      ))}
    </div>
  );
}
function EntrySource({ group }: { group: ChangeGroup }) {
  const { data, openDocument } = useWorkspace();
  if (!group.source) return null;
  const source = group.source;
  const doc = data?.documents.find(
    (d) =>
      d.branch === source.entryBranch &&
      d.path === source.entryPath &&
      d.commit === source.entryCommit,
  );
  return (
    <section aria-label="集中入口">
      <SectionTitle>集中入口</SectionTitle>
      {doc ? (
        <Source document={doc} />
      ) : (
        <p>
          {source.entryBranch} · {source.entryPath}
        </p>
      )}
      <p className="subtle-note">
        完整记录来源：{source.recordBranch ?? "待核对"}
      </p>
      {doc?.readable && (
        <button
          className="text-button"
          onClick={() => openDocument(doc.id, "", true)}
        >
          查看入口记录
        </button>
      )}
    </section>
  );
}
function CandidateSources({ group: g }: { group: ChangeGroup }) {
  const { openDocument } = useWorkspace();
  return (
    <>
      <SectionTitle>已推送候选</SectionTitle>
      <p className="subtle-note">没有唯一主来源，以下记录仅供核对。</p>
      {g.candidates.map((c) => (
        <div className="candidate-card" key={c.key}>
          <strong>
            <GitBranch size={14} />
            {c.branch}
          </strong>
          <code>{c.directory}</code>
          <p>声明主分支：{c.owner ?? "无法读取"}</p>
          <Diagnostics items={c.diagnostics} />
          <button
            className="button"
            onClick={() => openDocument(c.jsonDocumentId, "", true)}
          >
            查看 change.json
          </button>
          <DocumentList c={c} shortlist />
        </div>
      ))}
    </>
  );
}
function DocumentList({
  c,
  shortlist = false,
}: {
  c: ChangeCandidate;
  shortlist?: boolean;
}) {
  const { data, openDocument } = useWorkspace();
  const names: Record<string, string> = {
    "requirement.md": "需求与验收",
    "technical.md": "技术方案",
    "plan.md": "实施计划",
    "research.md": "调查依据",
    "execution.md": "执行证据",
    "review.md": "独立评审",
    "change.json": "流程状态原文",
    "merge-technical.md": "合码方案",
  };
  const docs = c.documentIds
    .map((id) => data!.documents.find((d) => d.id === id)!)
    .filter(
      (d) =>
        ["markdown", "json"].includes(d.kind) &&
        (!shortlist ||
          d.path.endsWith("/requirement.md") ||
          d.path.endsWith("/technical.md")),
    );
  return (
    <div className="document-list">
      {docs.map((d) => (
        <button
          key={d.id}
          onClick={() => openDocument(d.id, "", d.kind === "json")}
        >
          <FileText size={16} />
          <span>
            <strong>{names[d.path.split("/").at(-1)!] ?? d.title}</strong>
            <code>{d.path.split("/").at(-1)}</code>
          </span>
          {!d.readable && <Badge tone="warning">不可读</Badge>}
          <ChevronRight size={13} />
        </button>
      ))}
      {!shortlist &&
        [
          "requirement.md",
          "technical.md",
          "plan.md",
          "execution.md",
          "review.md",
        ]
          .filter(
            (name) => !docs.some((d) => d.path === `${c.directory}/${name}`),
          )
          .map((name) => (
            <div className="document-missing" key={name}>
              <FileText size={16} />
              <span>
                <strong>{names[name]}</strong>
                <code>{name}</code>
              </span>
              <Badge
                tone={
                  documentExpectation(c.state, name) === "缺失" ? "warning" : ""
                }
              >
                {documentExpectation(c.state, name)}
              </Badge>
            </div>
          ))}
      {!docs.length && <p className="muted">尚无已推送的正文材料。</p>}
    </div>
  );
}
function TaskDetails({ c }: { c: ChangeCandidate }) {
  const s = c.state;
  if (!s)
    return (
      <>
        <Diagnostics items={c.diagnostics} />
        <DocumentList c={c} />
      </>
    );
  const entries = Object.entries(s.tasks);
  return (
    <>
      <SectionTitle>
        任务 · {entries.filter(([, t]) => t.status === "done").length} /{" "}
        {entries.length}
      </SectionTitle>
      {entries.map(([id, t]) => (
        <div className="task-detail" key={id}>
          <div className="task-detail-heading">
            <span className={`task-state ${t.status}`}>
              <StateIcon status={t.status} />
            </span>
            <code>{id}</code>
            <strong>{t.title}</strong>
            <Badge tone={t.status}>{TASK_LABELS[t.status]}</Badge>
          </div>
          {t.reason && <p className="warning-text">{t.reason}</p>}
          {t.branch && (
            <p className="task-branch">
              <GitBranch size={12} />
              {t.branch}
            </p>
          )}
          {t.verification && (
            <p className="task-verification">
              <ShieldCheck size={13} />
              {t.verification}
            </p>
          )}
          {t.commitTitle && (
            <p className="task-commit">提交线索：{t.commitTitle}</p>
          )}
        </div>
      ))}
      {!entries.length && <p className="muted">尚未登记实现任务。</p>}
      <SectionTitle>执行顺序</SectionTitle>
      <TaskDependencies c={c} />
    </>
  );
}
function Closure({ state: s }: { state: ChangeState }) {
  const labels = {
      verification: "整体验证",
      acceptance: "验收",
      specs: "Specs 同步",
      archive: "归档提交",
    },
    results: Record<string, string> = {
      passed: "已通过",
      failed: "未通过",
      accepted: "已验收",
      synced: "已同步",
      not_needed: "无需变更",
      done: "已归档",
    };
  return (
    <>
      <SectionTitle>验收与归档</SectionTitle>
      <div className="closure-steps">
        {Object.entries(labels).map(([key, label], i) => {
          const step = s.closure[key as keyof ChangeState["closure"]];
          return (
            <div className={`closure-step ${step ? "recorded" : ""}`} key={key}>
              <span className="closure-number">{i + 1}</span>
              <div>
                <header>
                  <strong>{label}</strong>
                  <Badge
                    tone={
                      step?.result === "failed" ? "blocked" : step ? "done" : ""
                    }
                  >
                    {step ? results[step.result] : "未记录"}
                  </Badge>
                </header>
                {step && (
                  <>
                    <p>{step.summary}</p>
                    <time>{formatTime(step.at)}</time>
                    {step.source && (
                      <p className="evidence-source">{step.source}</p>
                    )}
                    {step.path && <code>{step.path}</code>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
function Evidence({ c, group: g }: { c: ChangeCandidate; group: ChangeGroup }) {
  const { openDocument, data } = useWorkspace(),
    s = c.state;
  return (
    <>
      <Diagnostics items={quality(g)} />
      {s && !activeFlow(g) && (
        <>
          <SectionTitle>流程记录</SectionTitle>
          <p className="subtle-note">
            {s.status === "cancelled"
              ? "取消时阶段"
              : c.validCompleted
                ? "归档前阶段"
                : "记录阶段"}
            ：{stageText(s)}
          </p>
        </>
      )}
      <SectionTitle>确认记录</SectionTitle>
      {s ? (
        Object.entries(s.confirmations).length ? (
          Object.entries(s.confirmations).map(([key, value]) => (
            <div className="evidence-card" key={key}>
              <header>
                <strong>
                  {key === "merge"
                    ? "合码"
                    : STAGE_LABELS[key as keyof typeof STAGE_LABELS]}
                  确认
                </strong>
                <Badge>已有记录</Badge>
              </header>
              <p>{value!.summary}</p>
              <time>{formatTime(value!.at)}</time>
              {value!.source && (
                <p className="evidence-source">{value!.source}</p>
              )}
            </div>
          ))
        ) : (
          <p className="muted">
            尚无确认记录。small 按既定方向直接推进，不要求三项确认。
          </p>
        )
      ) : (
        <p className="muted">状态格式非法，不能解释确认记录。</p>
      )}
      {s && <Closure state={s} />}
      <SectionTitle>读取来源</SectionTitle>
      <Source
        document={data!.documents.find((d) => d.id === c.jsonDocumentId)!}
      />
      <button
        className="text-button"
        onClick={() => openDocument(c.jsonDocumentId, "", true)}
      >
        <FileText size={13} />
        查看流程状态原文
      </button>
      {g.candidates.length > 1 && (
        <>
          <SectionTitle>其他候选记录</SectionTitle>
          <p className="subtle-note">
            当前目标存在多个候选记录，请核对目录与归档状态。
          </p>
          {g.candidates
            .filter((x) => x.key !== c.key)
            .map((x) => (
              <button
                className="copy-source"
                key={x.key}
                onClick={() => openDocument(x.jsonDocumentId, "", true)}
              >
                <GitBranch size={13} />
                {x.branch}
                <code>{x.commit.slice(0, 10)}</code>
              </button>
            ))}
        </>
      )}
    </>
  );
}
