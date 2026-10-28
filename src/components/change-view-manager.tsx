"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Settings,
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import {
  Button,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-folio/ui";
import { useWorkspace } from "./context";
import { useChangeViews } from "./change-views-context";
import { ApiError } from "./api";
import {
  DIRECTORY_STATES,
  DIRECTORY_LABELS,
  creatorName,
} from "@/lib/change-directory";
import { primaryRecord } from "@/lib/model";
import { URGENCY_LABELS } from "@/lib/change-labels";
import {
  queryFromUrl,
  queryToUrl,
  sameQuery,
  systemQuery,
  repositoryViewsSchema,
  type SavedChangeQuery,
  type SavedChangeView,
  type RepositoryViews,
} from "@/lib/change-views";
import styles from "./change-view-manager.module.css";

function QueryEditor({
  query,
  update,
}: {
  query: SavedChangeQuery;
  update: (query: SavedChangeQuery) => void;
}) {
  const { data } = useWorkspace();
  const types = [
    ...new Set([
      ...data!.changes.flatMap((g) => primaryRecord(g)?.state?.types ?? []),
      ...query.types,
    ]),
  ];
  const creators = [
    ...new Set([
      ...data!.changes.map(creatorName).filter(Boolean),
      ...query.creators.values,
    ]),
  ];
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  const choices = (
    title: string,
    values: Record<string, string>,
    selected: string[],
    change: (values: string[]) => void,
  ) => (
    <fieldset>
      <legend>{title}</legend>
      <div className={styles.choices}>
        {Object.entries(values).map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => change(toggle(selected, value))}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      {choices(
        "状态 · 可多选，全部不选表示不限",
        DIRECTORY_LABELS,
        query.states,
        (states) =>
          update({ ...query, states: states as SavedChangeQuery["states"] }),
      )}
      <fieldset>
        <legend>创建者</legend>
        <label>
          <input
            type="checkbox"
            checked={query.creators.self}
            onChange={(event) =>
              update({
                ...query,
                creators: { ...query.creators, self: event.target.checked },
              })
            }
          />
          我（当前 GitHub 身份）
        </label>
        <p className={styles.hint}>
          仅可识别的平台作者自动归入“我的”；其他记录可选择固定创建者。
        </p>
        <div className={styles.choices}>
          {creators.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={query.creators.values.includes(value)}
                onChange={() =>
                  update({
                    ...query,
                    creators: {
                      ...query.creators,
                      values: toggle(query.creators.values, value),
                    },
                  })
                }
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>类型</legend>
        <div className={styles.choices}>
          <label>
            <input
              type="checkbox"
              checked={query.noTypes}
              onChange={(e) => update({ ...query, noTypes: e.target.checked })}
            />
            无类型标签
          </label>
          {types.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={query.types.includes(value)}
                onChange={() =>
                  update({ ...query, types: toggle(query.types, value) })
                }
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>
      {choices("紧急程度", URGENCY_LABELS, query.urgencies, (urgencies) =>
        update({
          ...query,
          urgencies: urgencies as SavedChangeQuery["urgencies"],
        }),
      )}
      <div className={styles.display}>
        <label>
          显示
          <select
            value={query.display}
            onChange={(e) =>
              update({
                ...query,
                display: e.target.value as SavedChangeQuery["display"],
              })
            }
          >
            <option value="list">列表</option>
            <option value="board">看板</option>
          </select>
        </label>
        <label>
          分组
          <select
            value={query.group}
            onChange={(e) =>
              update({
                ...query,
                group: e.target.value as SavedChangeQuery["group"],
              })
            }
          >
            <option value="status">处理状态</option>
            <option value="stage">阶段</option>
            <option value="none">不分组</option>
          </select>
        </label>
        <label>
          排序
          <select
            value={query.sort}
            onChange={(e) =>
              update({
                ...query,
                sort: e.target.value as SavedChangeQuery["sort"],
              })
            }
          >
            <option value="created">最新创建</option>
            <option value="urgency">紧急程度优先</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>显示列</legend>
        <label>
          <input
            type="checkbox"
            checked={query.showCreator}
            onChange={(event) =>
              update({ ...query, showCreator: event.target.checked })
            }
          />
          创建者
        </label>
      </fieldset>
      {query.display === "board" && (
        <p className={styles.hint}>
          看板仅在桌面且只选进行中时展示，其余情况使用列表，保留此偏好。
        </p>
      )}
    </>
  );
}

export function ChangeViewManager({
  add = false,
  trigger,
}: {
  add?: boolean;
  trigger?: ReactNode;
}) {
  const views = useChangeViews();
  const { q } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RepositoryViews>();
  const [editing, setEditing] = useState<SavedChangeView>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [copy, setCopy] = useState(false);
  const [drag, setDrag] = useState<string>(),
    [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const originalIds = useRef<string[]>([]);
  const newView = () => ({
    id: crypto.randomUUID(),
    name: "",
    hidden: false,
    query: queryFromUrl(q),
  });
  const changeOpen = (value: boolean) => {
    if (busy) return;
    setOpen(value);
    setError("");
    setConflict(false);
    setCopy(false);
    setDrag(undefined);
    if (value && views.record) {
      setDraft(structuredClone(views.record));
      originalIds.current = views.record.views.map((v) => v.id);
      setEditing(add ? newView() : undefined);
      void views.reload();
    } else setEditing(undefined);
  };
  const move = (id: string, target: number) => {
    setDraft((current) => {
      if (!current) return current;
      const from = current.views.findIndex((v) => v.id === id);
      if (
        from < 0 ||
        from === target ||
        target < 0 ||
        target >= current.views.length
      )
        return current;
      const next = [...current.views];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      setAnnouncement(`${item.name}，第 ${target + 1} 个视图`);
      return { ...current, views: next };
    });
  };
  useEffect(() => {
    if (!drag) return;
    const movePointer = (event: PointerEvent) => {
      event.preventDefault();
      const rows = [
        ...(list.current?.querySelectorAll<HTMLElement>("[data-view-id]") ??
          []),
      ];
      const index = rows.findIndex((row) => {
        const rect = row.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
      if (index >= 0) move(drag, index);
      const container = list.current?.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (event.clientY < rect.top + 24) container.scrollTop -= 12;
        else if (event.clientY > rect.bottom - 24) container.scrollTop += 12;
      }
    };
    const end = () => setDrag(undefined);
    window.addEventListener("pointermove", movePointer, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [drag]);
  const updateViews = (next: SavedChangeView[]) =>
    setDraft((current) => current && { ...current, views: next });
  const check = (next: RepositoryViews) => {
    const parsed = repositoryViewsSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "视图配置不合法。");
      return;
    }
    return parsed.data;
  };
  const finishEdit = () => {
    if (!editing || !draft) return;
    const exists = draft.views.some((v) => v.id === editing.id);
    const next = check({
      ...draft,
      views: exists
        ? draft.views.map((v) => (v.id === editing.id ? editing : v))
        : [...draft.views, editing],
    });
    if (next) {
      setDraft(next);
      setEditing(undefined);
      setError("");
    }
  };
  const confirm = async () => {
    if (!draft) return;
    const checked = check(draft);
    if (!checked) return;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const created = checked.views.findLast(
        (v) => !originalIds.current.includes(v.id) && !v.hidden,
      );
      await views.save(checked.revision, checked.views, created?.id);
      setOpen(false);
      setCopy(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
      setConflict(cause instanceof ApiError && cause.code === "VIEW_CONFLICT");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverTrigger asChild>
        {trigger ?? (
          <IconButton aria-label="管理视图" disabled={!views.record}>
            <Settings />
          </IconButton>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={editing ? "编辑视图" : "管理视图"}
        className={styles.panel}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <h2>
          {editing
            ? draft?.views.some((v) => v.id === editing.id)
              ? "编辑视图"
              : "添加视图"
            : "管理视图"}
        </h2>
        <div className={styles.scroll}>
          {editing ? (
            <form
              id="change-view-editor"
              onSubmit={(event) => {
                event.preventDefault();
                finishEdit();
              }}
            >
              <label className={styles.name}>
                名称
                <Input
                  autoFocus
                  aria-label="视图名称"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <QueryEditor
                query={editing.query}
                update={(query) => setEditing({ ...editing, query })}
              />
            </form>
          ) : (
            <>
              <p className={styles.hint}>
                系统 tab 固定在前；拖动可调整右侧个人视图的顺序。
              </p>
              <ul ref={list} className={styles.list} aria-label="个人视图">
                {draft?.views.map((view, index) => (
                  <li
                    key={view.id}
                    data-view-id={view.id}
                    data-dragging={drag === view.id || undefined}
                  >
                    <IconButton
                      className={styles.handle}
                      aria-label={`拖动 ${view.name} 排序`}
                      title="拖动排序，或使用 Alt + 方向键"
                      disabled={busy}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.focus();
                        setDrag(view.id);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.altKey &&
                          ["ArrowUp", "ArrowDown"].includes(event.key)
                        ) {
                          event.preventDefault();
                          move(
                            view.id,
                            index + (event.key === "ArrowUp" ? -1 : 1),
                          );
                        }
                      }}
                    >
                      <GripVertical />
                    </IconButton>
                    <span className={styles.viewName}>{view.name}</span>
                    <IconButton
                      aria-label={`${view.hidden ? "显示" : "隐藏"} ${view.name}`}
                      disabled={busy}
                      onClick={() =>
                        updateViews(
                          draft.views.map((v) =>
                            v.id === view.id ? { ...v, hidden: !v.hidden } : v,
                          ),
                        )
                      }
                    >
                      {view.hidden ? <EyeOff /> : <Eye />}
                    </IconButton>
                    <IconButton
                      aria-label={`编辑 ${view.name}`}
                      disabled={busy}
                      onClick={() => {
                        setEditing(structuredClone(view));
                        setError("");
                      }}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      aria-label={`删除 ${view.name}`}
                      disabled={busy}
                      onClick={() =>
                        updateViews(draft.views.filter((v) => v.id !== view.id))
                      }
                    >
                      <Trash2 />
                    </IconButton>
                  </li>
                ))}
              </ul>
              {!draft?.views.length && (
                <p className={styles.hint}>
                  暂无个人视图，可以用当前筛选添加。
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {conflict && (
            <div className={styles.conflict}>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const next = await views.reload();
                  if (next) {
                    setDraft(structuredClone(next));
                    originalIds.current = next.views.map((v) => v.id);
                    setError("");
                    setConflict(false);
                    setCopy(false);
                  }
                }}
              >
                重新加载管理列表（丢弃草稿）
              </Button>
              <Button size="sm" onClick={() => setCopy(true)}>
                复制本地配置
              </Button>
            </div>
          )}
          {copy && (
            <label className={styles.name}>
              本地配置（可全选复制）
              <textarea
                readOnly
                value={JSON.stringify(draft?.views, null, 2)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          )}
        </div>
        <div className={styles.footer}>
          {editing ? (
            <>
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setError("");
                }}
              >
                取消编辑
              </Button>
              <Button variant="primary" type="submit" form="change-view-editor">
                完成编辑
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy || (draft?.views.length ?? 0) >= 30}
                onClick={() => {
                  setEditing(newView());
                  setError("");
                }}
              >
                <Plus />
                添加视图
              </Button>
              <span />
              <Button disabled={busy} onClick={() => changeOpen(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => void confirm()}
              >
                确认
              </Button>
            </>
          )}
        </div>
        <span role="status" className={styles.srOnly}>
          {announcement}
        </span>
      </PopoverContent>
    </Popover>
  );
}

export function ChangeViewActions() {
  const views = useChangeViews();
  const { q, nav } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = queryFromUrl(q);
  const saved = views.record?.views.find(
    (v) => !v.hidden && v.id === q.changeView,
  );
  const system = q.changeView?.startsWith("system:")
    ? q.changeView.slice(7)
    : !q.changeView && current.states.length === 1
      ? current.states[0]
      : undefined;
  const baseline =
    saved?.query ??
    (DIRECTORY_STATES.includes(system as (typeof DIRECTORY_STATES)[number])
      ? systemQuery(system as (typeof DIRECTORY_STATES)[number])
      : undefined);
  const dirty = !baseline || !sameQuery(current, baseline) || q.issues === "1";
  if (!views.record || !dirty) return null;
  const save = async () => {
    if (!saved || !views.record) return;
    setBusy(true);
    setError("");
    try {
      await views.save(
        views.record.revision,
        views.record.views.map((v) =>
          v.id === saved.id ? { ...v, query: current } : v,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.actions} aria-label="视图临时修改">
      <span>{baseline ? "未保存修改" : "临时查询"}</span>
      {baseline && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            nav(queryToUrl(baseline));
            setError("");
          }}
        >
          恢复视图
        </Button>
      )}
      {saved && q.issues !== "1" && (
        <Button size="sm" loading={busy} onClick={() => void save()}>
          保存到当前视图
        </Button>
      )}
      <ChangeViewManager
        add
        trigger={
          <Button size="sm" disabled={busy}>
            另存为视图
          </Button>
        }
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
