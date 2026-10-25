"use client";
import { useMemo, type ReactNode } from "react";
import {
  Flag,
  GitPullRequest,
  ListFilter,
  Settings2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@open-folio/ui";
import {
  primaryRecord,
  STAGES,
  STAGE_LABELS,
  type ChangeGroup,
} from "@/lib/model";
import { matchingFollowUps } from "@/lib/follow-ups";
import { URGENCY_LABELS } from "@/lib/change-labels";
import {
  classifyDirectoryState,
  DIRECTORY_STATES,
  DIRECTORY_LABELS,
  changeDiagnostics,
  creatorName,
  filterDirectoryChanges,
  groupDirectoryChanges,
  matchesDirectoryScope,
  readDirectoryQuery,
  sortDirectoryChanges,
} from "@/lib/change-directory";
import { useSavedScroll, useWorkspace } from "./context";
import { ChangeViewManager, ChangeViewActions } from "./change-view-manager";
import { useChangeViews } from "./change-views-context";
import {
  queryToUrl,
  sameQuery,
  defaultRepositoryViews,
} from "@/lib/change-views";
import { usePersonal } from "./personal-context";
import { useMediaQuery } from "./use-media";
import { Empty } from "./document";
import page from "./personal.module.css";
import styles from "./change-directory.module.css";

const SCOPES = [
  ["active", "进行中"],
  ["completed", "已完成"],
  ["archived", "已归档"],
  ["cancelled", "已取消"],
] as const;
const deliveryLabels = {
  pendingIntegration: "待集成",
  pendingRelease: "待发布",
  releaseMerged: "已发布",
  unknown: "交付待核实",
};
function Progress({
  change,
  all,
}: {
  change: ChangeGroup;
  all: ChangeGroup[];
}) {
  const state = primaryRecord(change)?.state;
  if (!state) return <span>—</span>;
  const tasks = Object.values(state.tasks);
  const total =
    state.size === "xlarge" ? (state.children?.length ?? 0) : tasks.length;
  const done =
    state.size === "xlarge"
      ? (state.children ?? []).filter((id) => {
          const group = all.find((g) => g.id === id),
            record = group && primaryRecord(group);
          return (
            record?.validCompleted ||
            (record?.state?.status === "cancelled" &&
              group &&
              !changeDiagnostics(group).length)
          );
        }).length
      : tasks.filter((t) => t.status === "done").length;
  const blocked = tasks.some((t) => t.status === "blocked");
  return (
    <span
      className={styles.progress}
      data-blocked={blocked || undefined}
      title={state.size === "xlarge" ? "子 Change 结束数" : "任务进度"}
    >
      {blocked ? (
        <TriangleAlert aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <circle
            cx="8"
            cy="8"
            r="6.2"
            strokeDasharray={`${total ? (done / total) * 39 : 0} 39`}
          />
        </svg>
      )}
      {done}/{total}
      {state.size === "xlarge" && " 子项"}
    </span>
  );
}
function Series({
  all,
  changes,
  render,
}: {
  all: ChangeGroup[];
  changes: ChangeGroup[];
  render: (change: ChangeGroup) => ReactNode;
}) {
  const index = matchingFollowUps(all, changes);
  return [...index.visible].map(([root, matched]) =>
    index.groups.get(root)!.length > 1 ? (
      <li className={styles.series} key={root}>
        <section aria-label={`${index.titles.get(root)} 的连续交付`}>
          <h3>{index.titles.get(root)}</h3>
          {index.titleProblems.has(root) && (
            <p>{index.titleProblems.get(root)}</p>
          )}
          <ul>
            {matched.map((g) => (
              <li key={g.id}>{render(g)}</li>
            ))}
          </ul>
        </section>
      </li>
    ) : (
      <li key={matched[0].id}>
        {render(matched[0])}
        {index.problems.has(matched[0].id) && (
          <p className={styles.problem}>
            延续关系不可用：{index.problems.get(matched[0].id)}
          </p>
        )}
      </li>
    ),
  );
}
export function ChangeDirectory({ onOpen }: { onOpen?: (id: string) => void }) {
  const { data, q, nav, projectId } = useWorkspace();
  const identity = usePersonal()?.connection?.identity;
  const views = useChangeViews();
  const all = data!.changes;
  const query = useMemo(() => readDirectoryQuery(q), [q]);
  const mobile = useMediaQuery("(max-width: 760px)");
  const visible = sortDirectoryChanges(
    filterDirectoryChanges(all, query, data?.deliveryByChange, identity),
    query.labels.sortByUrgency,
  );
  const groups = groupDirectoryChanges(visible, query, data?.deliveryByChange);
  const board =
    query.view === "board" &&
    query.scope === "active" &&
    !query.issues &&
    !mobile;
  const issues = all.filter(
    (g) => changeDiagnostics(g).length || !primaryRecord(g)?.state,
  );
  const scroll = useSavedScroll(
    `${projectId}.changes.${query.scope}.${board ? "board" : "list"}`,
  );
  const mine = views.record?.views.find((v) => v.id === "mine");
  const intrinsicMine =
    q.changeView === "mine" &&
    !!mine &&
    sameQuery(mine.query, defaultRepositoryViews().views[0].query);
  const systemState = q.changeView?.startsWith("system:")
    ? q.changeView.slice(7)
    : !q.changeView && query.scope !== "mixed"
      ? query.scope
      : undefined;
  const intrinsicState = intrinsicMine ? "active" : systemState;
  const visibleStates = query.states.filter(
    (state) => state !== intrinsicState,
  );
  const showSelf = query.creatorSelf && !intrinsicMine;
  const clear = () =>
    nav({
      types: null,
      noTypes: null,
      urgency: null,
      creator: null,
      creatorSelf: intrinsicMine ? "1" : null,
      states: JSON.stringify(intrinsicState ? [intrinsicState] : []),
    });
  const toggle = (
    key: "types" | "creator" | "urgency" | "states",
    value: string,
  ) => {
    const current =
      key === "states"
        ? query.states
        : key === "types"
          ? query.labels.types
          : key === "creator"
            ? query.creators
            : query.urgencies;
    const next = (current as string[]).includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    nav({
      [key]:
        key === "states"
          ? JSON.stringify(next)
          : next.length
            ? key === "urgency" && next.length === 1
              ? next[0]
              : JSON.stringify(next)
            : null,
    });
  };
  const types = [
    ...new Set([
      ...all.flatMap((g) => primaryRecord(g)?.state?.types ?? []),
      ...query.labels.types,
    ]),
  ];
  const creators = [
    ...new Set([...all.map(creatorName).filter(Boolean), ...query.creators]),
  ];
  const filterCount =
    query.labels.types.length +
    Number(query.labels.noTypes) +
    query.urgencies.length +
    query.creators.length +
    Number(showSelf) +
    visibleStates.length;
  const chips = [
    ...visibleStates.map((v) => ({
      key: "states" as const,
      value: v,
      label: DIRECTORY_LABELS[v],
    })),
    ...query.labels.types.map((v) => ({
      key: "types" as const,
      value: v,
      label: `类型：${v}`,
    })),
    ...query.urgencies.map((v) => ({
      key: "urgency" as const,
      value: v,
      label: `紧急程度：${URGENCY_LABELS[v as keyof typeof URGENCY_LABELS]}`,
    })),
    ...query.creators.map((v) => ({
      key: "creator" as const,
      value: v,
      label: `创建者：${v}`,
    })),
  ];
  const href = (id: string) =>
    `?${new URLSearchParams({ ...q, c: id, ct: "overview" })}`;
  const open = (event: React.MouseEvent, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onOpen?.(id);
    nav({
      c: id,
      ct: "overview",
      preview: null,
      device: null,
      orientation: null,
      zoom: null,
      cf: null,
      cv: null,
      raw: null,
      doc: null,
    });
  };
  const summary = (change: ChangeGroup) => {
    const state = primaryRecord(change)?.state;
    if (query.issues)
      return (
        changeDiagnostics(change)
          .map((d) => d.message)
          .join("；") || "无法确定流程状态"
      );
    if (state?.status === "cancelled") return state.cancellation?.reason;
    return (
      state?.waitingFor?.summary ??
      Object.values(state?.tasks ?? {}).find(
        (task) => task.status === "blocked",
      )?.reason
    );
  };
  const labels = (change: ChangeGroup) => {
    const state = primaryRecord(change)?.state;
    return (
      <>
        {state?.types?.map((type) => (
          <Badge key={type} title={type}>
            {type}
          </Badge>
        ))}
      </>
    );
  };
  const urgency = (change: ChangeGroup) => {
    const urgency = primaryRecord(change)?.state?.urgency;
    return urgency && (urgency === "urgent" || urgency === "high") ? (
      <span
        className={styles.flag}
        data-urgency={urgency}
        title={`紧急程度：${URGENCY_LABELS[urgency]}`}
      >
        <Flag aria-hidden="true" />
        {URGENCY_LABELS[urgency]}
      </span>
    ) : null;
  };
  const delivery = (change: ChangeGroup, showBadge = true) => {
    const d = data?.deliveryByChange?.[change.id];
    const pr =
      d?.changePrs.find((pr) => pr.state === "open") ?? d?.changePrs[0];
    return (
      <>
        {showBadge && d?.stage && (
          <Badge
            tone={
              d.stage === "releaseMerged"
                ? "success"
                : d.stage === "unknown"
                  ? "warning"
                  : "neutral"
            }
          >
            {deliveryLabels[d.stage]}
          </Badge>
        )}
        {pr && (
          <a
            className={styles.pr}
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Change PR #${pr.number}${pr.draft ? " 草稿" : ""}`}
          >
            <GitPullRequest aria-hidden="true" />#{pr.number}
            {pr.draft && " 草稿"}
          </a>
        )}
      </>
    );
  };
  const row = (change: ChangeGroup) => {
    const record = primaryRecord(change),
      state = record?.state,
      creator = creatorName(change),
      date = change.createdAt ? new Date(change.createdAt) : undefined,
      rowScope = classifyDirectoryState(
        change,
        data?.deliveryByChange?.[change.id],
      ),
      ended = rowScope !== "active" && !query.issues,
      endAt =
        state?.status === "cancelled"
          ? state.cancellation?.at
          : state?.closure.archive?.at,
      deliveryStage = data?.deliveryByChange?.[change.id]?.stage ?? "unknown";
    return (
      <div className={styles.row}>
        <div className={styles.mainCell}>
          <a
            className={styles.titleLink}
            href={href(change.id)}
            onClick={(event) => open(event, change.id)}
            data-change-id={change.id}
            aria-label={`打开 ${change.title}`}
          >
            <span className={styles.title}>
              {urgency(change)}
              {change.title}
            </span>
          </a>
          <div className={styles.meta}>
            <code>{change.id}</code>
            {labels(change)}
            {delivery(
              change,
              rowScope !== "completed" && rowScope !== "archived",
            )}
            {summary(change) && (
              <span
                className={styles.wait}
                data-blocked={
                  Object.values(state?.tasks ?? {}).some(
                    (t) => t.status === "blocked",
                  ) || undefined
                }
              >
                {summary(change)}
              </span>
            )}
          </div>
        </div>
        <span className={styles.stage}>
          {query.issues ? (
            "来源异常"
          ) : rowScope === "completed" || rowScope === "archived" ? (
            <Badge
              tone={
                deliveryStage === "releaseMerged"
                  ? "success"
                  : deliveryStage === "unknown"
                    ? "warning"
                    : "neutral"
              }
            >
              {deliveryLabels[deliveryStage]}
            </Badge>
          ) : rowScope === "cancelled" ? (
            "已取消"
          ) : state ? (
            STAGE_LABELS[state.stage]
          ) : (
            "来源异常"
          )}
        </span>
        {ended ? (
          <time
            className={styles.endTime}
            dateTime={endAt}
            title={endAt ? new Date(endAt).toLocaleString("zh-CN") : undefined}
          >
            {endAt
              ? new Date(endAt).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                })
              : "—"}
          </time>
        ) : query.issues ? (
          <span />
        ) : (
          <Progress change={change} all={all} />
        )}
        <span className={styles.who}>
          {creator ? (
            <>
              <Avatar name={creator} />
              <span>{creator}</span>
            </>
          ) : (
            "—"
          )}
        </span>
        <time
          className={styles.date}
          dateTime={change.createdAt}
          title={date?.toLocaleString("zh-CN")}
        >
          {date?.toLocaleDateString("zh-CN", {
            month: "numeric",
            day: "numeric",
          }) ?? "—"}
        </time>
      </div>
    );
  };
  return (
    <div className={page.page} ref={scroll}>
      <div className={`${page.inner} ${styles.inner}`}>
        <header className={page.heading}>
          <h1>Changes</h1>
        </header>
        <div className={styles.toolbar}>
          <Tabs
            className={styles.viewTabs}
            value={
              query.issues
                ? "issues"
                : (q.changeView ?? `system:${query.scope}`)
            }
            onValueChange={(value) =>
              views.select(
                value.startsWith("system:")
                  ? {
                      kind: "system",
                      id: value.slice(7) as (typeof DIRECTORY_STATES)[number],
                    }
                  : { kind: "personal", id: value },
              )
            }
          >
            <TabsList aria-label="Change 状态">
              {SCOPES.filter(
                ([scope]) =>
                  scope !== "cancelled" ||
                  all.some((g) =>
                    matchesDirectoryScope(
                      g,
                      scope,
                      data?.deliveryByChange?.[g.id],
                    ),
                  ),
              ).map(([scope, label]) => (
                <TabsTrigger key={scope} value={`system:${scope}`}>
                  {label}
                  <span className={styles.count}>
                    {
                      all.filter((g) =>
                        matchesDirectoryScope(
                          g,
                          scope,
                          data?.deliveryByChange?.[g.id],
                        ),
                      ).length
                    }
                  </span>
                </TabsTrigger>
              ))}
              {views.record?.views
                .filter((v) => !v.hidden)
                .map((view) => (
                  <TabsTrigger key={view.id} value={view.id}>
                    {view.name}
                    <span className={styles.count}>
                      {
                        filterDirectoryChanges(
                          all,
                          readDirectoryQuery(
                            Object.fromEntries(
                              Object.entries(queryToUrl(view.query)).filter(
                                (entry): entry is [string, string] =>
                                  entry[1] !== null,
                              ),
                            ),
                          ),
                          data?.deliveryByChange,
                          identity,
                        ).length
                      }
                    </span>
                  </TabsTrigger>
                ))}
            </TabsList>
          </Tabs>
          <ChangeViewManager />
          <span className={styles.spacer} />
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                aria-label={
                  filterCount ? `筛选，已选 ${filterCount} 项` : "筛选"
                }
              >
                <ListFilter />
                <span className={styles.toolLabel}>筛选</span>
                {filterCount > 0 && (
                  <span className={styles.count}>{filterCount}</span>
                )}
              </Button>
            </MenuTrigger>
            <MenuContent
              aria-label="筛选"
              align="end"
              className={styles.filterMenu}
            >
              <MenuLabel>状态 · 可多选</MenuLabel>
              {DIRECTORY_STATES.map((state) => (
                <MenuCheckboxItem
                  key={state}
                  checked={query.states.includes(state)}
                  onCheckedChange={() => toggle("states", state)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {DIRECTORY_LABELS[state]}
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              <MenuLabel>类型</MenuLabel>
              <MenuCheckboxItem
                checked={query.labels.noTypes}
                onCheckedChange={(checked) =>
                  nav({ noTypes: checked ? "1" : null })
                }
                onSelect={(e) => e.preventDefault()}
              >
                无类型标签
              </MenuCheckboxItem>
              {types.map((type) => (
                <MenuCheckboxItem
                  key={type}
                  checked={query.labels.types.includes(type)}
                  onCheckedChange={() => toggle("types", type)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {type}
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              <MenuLabel>紧急程度</MenuLabel>
              {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                <MenuCheckboxItem
                  key={value}
                  checked={query.urgencies.includes(value)}
                  onCheckedChange={() => toggle("urgency", value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label}
                </MenuCheckboxItem>
              ))}
              {
                <>
                  <MenuSeparator />
                  <MenuLabel>创建者</MenuLabel>
                  <MenuCheckboxItem
                    checked={query.creatorSelf}
                    onCheckedChange={(checked) =>
                      nav({ creatorSelf: checked ? "1" : null })
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    我（当前 GitHub 身份）
                  </MenuCheckboxItem>
                  {creators.map((creator) => (
                    <MenuCheckboxItem
                      key={creator}
                      checked={query.creators.includes(creator)}
                      onCheckedChange={() => toggle("creator", creator)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Avatar name={creator} />
                      {creator}
                    </MenuCheckboxItem>
                  ))}
                </>
              }
              {!!filterCount && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={clear}>清除筛选</MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" aria-label="显示">
                <Settings2 />
                <span className={styles.toolLabel}>显示</span>
              </Button>
            </MenuTrigger>
            <MenuContent aria-label="显示" align="end">
              <MenuLabel>视图</MenuLabel>
              <MenuRadioGroup
                value={query.view}
                onValueChange={(view) =>
                  nav({ view: view === "list" ? null : view })
                }
              >
                <MenuRadioItem value="list">列表</MenuRadioItem>
                <MenuRadioItem
                  value="board"
                  disabled={query.scope !== "active" || query.issues}
                >
                  看板
                </MenuRadioItem>
              </MenuRadioGroup>
              <MenuSeparator />
              <MenuLabel>分组</MenuLabel>
              <MenuRadioGroup
                value={query.group}
                onValueChange={(group) =>
                  nav({ group: group === "status" ? null : group })
                }
              >
                {[
                  ["status", "处理状态"],
                  ["stage", "阶段"],
                  ["none", "不分组"],
                ].map(([value, label]) => (
                  <MenuRadioItem key={value} value={value}>
                    {label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
              <MenuSeparator />
              <MenuLabel>排序</MenuLabel>
              <MenuRadioGroup
                value={query.labels.sortByUrgency ? "urgency" : "created"}
                onValueChange={(sort) =>
                  nav({ sort: sort === "created" ? null : sort })
                }
              >
                <MenuRadioItem value="created">最新创建</MenuRadioItem>
                <MenuRadioItem value="urgency">紧急程度优先</MenuRadioItem>
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </div>
        <ChangeViewActions />
        {views.error && (
          <div role="status">
            {views.error}
            <Button size="sm" onClick={() => void views.reload()}>
              重试
            </Button>
          </div>
        )}
        {!!filterCount && (
          <div className={styles.chips} aria-label="已选筛选">
            {showSelf && (
              <button
                aria-label="移除筛选 创建者：我"
                onClick={() => nav({ creatorSelf: null })}
              >
                创建者：我
                <X />
              </button>
            )}
            {query.labels.noTypes && (
              <button onClick={() => nav({ noTypes: null })}>
                无类型标签
                <X />
              </button>
            )}
            {chips.map((chip) => (
              <button
                key={`${chip.key}:${chip.value}`}
                aria-label={`移除筛选 ${chip.label}`}
                onClick={() => toggle(chip.key, chip.value)}
              >
                {chip.label}
                <X />
              </button>
            ))}
            <button className={styles.clear} onClick={clear}>
              清除筛选
            </button>
          </div>
        )}
        {!!issues.length && (
          <div className={page.banner} data-tone="warning">
            <TriangleAlert aria-hidden="true" />
            <span>
              {query.issues
                ? "正在查看无法完整读取的记录"
                : `${issues.length} 个 Change 的记录无法完整读取`}
            </span>
            <Button
              size="sm"
              onClick={() => nav({ issues: query.issues ? null : "1" })}
            >
              {query.issues ? "返回列表" : "查看"}
            </Button>
          </div>
        )}
        {!visible.length ? (
          <Empty
            title={
              filterCount > Number(showSelf)
                ? "没有符合条件的 Change"
                : query.issues
                  ? "目前没有来源异常"
                  : query.creatorSelf
                    ? "暂无你创建的 Change"
                    : `暂无${SCOPES.find(([scope]) => scope === query.scope)?.[1] ?? "符合条件"}的 Change`
            }
          >
            {query.creatorSelf && (
              <>
                <p>
                  仅可识别的平台作者自动归入“我的”，其他记录可用固定创建者筛选查看。
                </p>
                <Button
                  onClick={() => views.select({ kind: "system", id: "active" })}
                >
                  查看进行中
                </Button>
              </>
            )}
            {filterCount > 0 && <Button onClick={clear}>清除筛选</Button>}
          </Empty>
        ) : board ? (
          <div
            className={styles.board}
            role="region"
            aria-label="按阶段看板（只读）"
          >
            {STAGES.map((stage) => {
              const items = visible.filter(
                (g) => primaryRecord(g)?.state?.stage === stage,
              );
              return (
                <section
                  className={styles.column}
                  key={stage}
                  aria-label={STAGE_LABELS[stage]}
                >
                  <h2>
                    {STAGE_LABELS[stage]}
                    <span>{items.length}</span>
                  </h2>
                  <ul>
                    <Series
                      all={all}
                      changes={items}
                      render={(change) => (
                        <a
                          className={styles.card}
                          href={href(change.id)}
                          onClick={(event) => open(event, change.id)}
                          data-change-id={change.id}
                          aria-label={`打开 ${change.title}`}
                        >
                          <span className={styles.title}>
                            {urgency(change)}
                            {change.title}
                          </span>
                          <span className={styles.meta}>{labels(change)}</span>
                          {summary(change) && (
                            <span className={styles.wait}>
                              {summary(change)}
                            </span>
                          )}
                          <span className={styles.cardFoot}>
                            <Progress change={change} all={all} />
                            {creatorName(change) && (
                              <Avatar name={creatorName(change)} />
                            )}
                          </span>
                        </a>
                      )}
                    />
                  </ul>
                  {!items.length && <p>没有 Change</p>}
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.table} role="region" aria-label="Change 列表">
            <div className={styles.tableHead} aria-hidden="true">
              <span>Change</span>
              <span>
                {query.issues
                  ? "问题"
                  : query.scope === "completed" || query.scope === "archived"
                    ? "交付"
                    : query.scope === "cancelled"
                      ? "状态"
                      : query.scope === "mixed"
                        ? "阶段 / 交付"
                        : "阶段"}
              </span>
              <span>
                {query.issues
                  ? ""
                  : query.scope === "completed" || query.scope === "archived"
                    ? "归档"
                    : query.scope === "cancelled"
                      ? "取消"
                      : query.scope === "mixed"
                        ? "任务 / 结束"
                        : "任务"}
              </span>
              <span>创建者</span>
              <span>创建</span>
            </div>
            {groups.map((group) => (
              <section key={group.name} aria-label={group.name || "Changes"}>
                {group.name && (
                  <h2 className={styles.groupHeading}>
                    {group.name}
                    <span>{group.items.length}</span>
                  </h2>
                )}
                <ul className={styles.rows}>
                  <Series all={all} changes={group.items} render={row} />
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
