"use client";

import { Button, Badge } from "@open-folio/ui";
import { ChevronRight } from "lucide-react";
import { Fragment, useId, useMemo, useState, type ReactNode } from "react";
import { followUpIndex, matchingFollowUps } from "@/lib/follow-ups";
import { primaryRecord, STATUS_LABELS, type ChangeGroup } from "@/lib/model";
import { useWorkspace } from "./context";

function FollowUpGroup({
  root,
  members,
  matched,
  render,
  open,
}: {
  root: ChangeGroup;
  members: ChangeGroup[];
  matched: ChangeGroup[];
  render: (change: ChangeGroup) => ReactNode;
  open: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const active = members.filter(
    (g) => primaryRecord(g)?.state?.status === "active",
  );
  const selected =
    matched.find((g) => primaryRecord(g)?.state?.status === "active") ??
    members.toReversed().find((g) => matched.some((m) => m.id === g.id))!;
  return (
    <section
      className="follow-up-group"
      aria-label={`${root.title} 的连续交付`}
    >
      <div className="follow-up-heading">
        <button
          className="follow-up-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={`${expanded ? "收起" : "展开"} ${root.title} 的交付记录`}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={16} aria-hidden="true" />
          <span>
            <strong>{root.title}</strong>
            <span className="follow-up-caption">
              {members.length} 次交付记录
              {matched.length !== members.length &&
                ` · 当前匹配 ${matched.length} 条`}
            </span>
            <span className="follow-up-caption">
              {primaryRecord(selected)?.state?.status === "active"
                ? "进行中"
                : "当前记录"}
              ：{selected.title}
            </span>
          </span>
        </button>
        <div className="follow-up-actions">
          {active.length > 0 && (
            <Badge tone="info">{active.length} 项调整进行中</Badge>
          )}
          <Button variant="text" onClick={() => open(selected.id)}>
            查看
            {primaryRecord(selected)?.state?.status === "active"
              ? "进行中"
              : "记录"}
          </Button>
        </div>
      </div>
      <div id={contentId} hidden={!expanded}>
        {matched.map((change) => (
          <Fragment key={change.id}>{render(change)}</Fragment>
        ))}
      </div>
    </section>
  );
}

export function GroupedChangeRows({
  changes,
  render,
  open,
}: {
  changes: ChangeGroup[];
  render: (change: ChangeGroup) => ReactNode;
  open: (id: string) => void;
}) {
  const { data } = useWorkspace();
  const index = useMemo(
    () => matchingFollowUps(data!.changes, changes),
    [data, changes],
  );
  return [...index.visible].map(([rootId, matched]) => {
    const members = index.groups.get(rootId)!;
    const root = members.find((g) => g.id === rootId)!;
    if (members.length > 1)
      return (
        <FollowUpGroup
          key={rootId}
          {...{ root, members, matched, render, open }}
        />
      );
    const change = matched[0];
    return (
      <Fragment key={change.id}>
        {render(change)}
        {index.problems.has(change.id) && (
          <p className="follow-up-warning">
            延续关系不可用：{index.problems.get(change.id)}
          </p>
        )}
      </Fragment>
    );
  });
}

export function FollowUpContext({ change }: { change: ChangeGroup }) {
  const { data, nav } = useWorkspace();
  const index = useMemo(() => followUpIndex(data!.changes), [data]);
  const prior = primaryRecord(change)?.state?.followUpOf;
  const members = index.groups.get(index.roots.get(change.id)!);
  const problem = index.problems.get(change.id);
  if (!problem && !prior && (!members || members.length < 2)) return null;
  return (
    <section className="follow-up-context" aria-label="连续交付">
      <h3>连续交付</h3>
      {problem ? (
        <p className="warning-text">延续关系不可用：{problem}</p>
      ) : (
        prior && (
          <p>
            延续自{" "}
            <Button
              variant="text"
              onClick={() => nav({ c: prior, ct: "overview" })}
            >
              {data!.changes.find((g) => g.id === prior)?.title ?? prior}
            </Button>
          </p>
        )
      )}
      <p className="subtle-note">每次交付保留独立的任务、验收与归档记录。</p>
      {members && members.length > 1 && (
        <ul>
          {members.map((g) => {
            const state = primaryRecord(g)?.state;
            return (
              <li key={g.id}>
                {g.id === change.id ? (
                  <strong aria-current="true">{g.title}</strong>
                ) : (
                  <Button
                    variant="text"
                    onClick={() => nav({ c: g.id, ct: "overview" })}
                  >
                    {g.title}
                  </Button>
                )}
                <span>
                  {state ? STATUS_LABELS[state.status] : "来源待核对"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
