"use client";

import { Badge, Button, type BadgeTone } from "@open-folio/ui";
import { Popover } from "radix-ui";
import { Tags } from "lucide-react";
import { primaryRecord, type ChangeGroup, type ChangeState } from "@/lib/model";
import { URGENCY_LABELS, type LabelQuery } from "@/lib/change-labels";

const tones: Record<keyof typeof URGENCY_LABELS, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

export function ChangeLabels({
  state,
  detail = false,
}: {
  state: ChangeState | null | undefined;
  detail?: boolean;
}) {
  if (!state) return null;
  const types = state.types ?? [];
  const urgency = state.urgency ?? "normal";
  if (!detail && !types.length && urgency === "normal") return null;
  return (
    <span className="change-labels">
      {types.map((type) => (
        <Badge key={type}>{type}</Badge>
      ))}
      {detail && !types.length && <span className="muted">无类型标签</span>}
      {(detail || urgency !== "normal") && (
        <Badge
          className="change-urgency"
          tone={tones[urgency]}
          aria-label={`紧急程度：${URGENCY_LABELS[urgency]}`}
        >
          {URGENCY_LABELS[urgency]}
        </Badge>
      )}
    </span>
  );
}

export function ChangeLabelFilters({
  groups,
  query,
  nav,
}: {
  groups: ChangeGroup[];
  query: LabelQuery;
  nav: (patch: Record<string, string | null>) => void;
}) {
  const choices = [
    ...new Set([
      ...groups.flatMap((g) => primaryRecord(g)?.state?.types ?? []),
      ...query.types,
    ]),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const count = query.types.length + Number(query.noTypes);
  const toggle = (type: string, checked: boolean) => {
    const types = checked
      ? [...query.types, type]
      : query.types.filter((value) => value !== type);
    nav({ types: types.length ? JSON.stringify(types) : null });
  };
  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            className="type-filter-trigger"
            aria-label={count ? `筛选类型，已选 ${count} 项` : "筛选类型"}
          >
            <Tags size={12} />
            {count ? `类型 · ${count}` : "所有类型"}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="type-filter-popover"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            aria-label="类型筛选"
          >
            <fieldset>
              <legend>类型（匹配任意选中项）</legend>
              <label>
                <input
                  type="checkbox"
                  checked={query.noTypes}
                  onChange={(e) =>
                    nav({ noTypes: e.target.checked ? "1" : null })
                  }
                />
                <span>无类型标签</span>
              </label>
              {choices.map((type) => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={query.types.includes(type)}
                    onChange={(e) => toggle(type, e.target.checked)}
                  />
                  <span>{type}</span>
                </label>
              ))}
              {!choices.length && <p className="muted">项目暂无类型标签</p>}
            </fieldset>
            <Button
              variant="text"
              disabled={!count}
              onClick={() => nav({ types: null, noTypes: null })}
            >
              清除类型
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <select
        aria-label="筛选紧急程度"
        value={query.urgency}
        onChange={(e) => nav({ urgency: e.target.value || null })}
      >
        <option value="">所有紧急程度</option>
        {Object.entries(URGENCY_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="变更排序"
        value={query.sortByUrgency ? "urgency" : ""}
        onChange={(e) => nav({ sort: e.target.value || null })}
      >
        <option value="">创建时间</option>
        <option value="urgency">紧急程度优先</option>
      </select>
    </>
  );
}
