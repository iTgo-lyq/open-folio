"use client";

import { Button } from "@open-folio/ui";
import { Fragment, useMemo, type ReactNode } from "react";
import { followUpIndex, matchingFollowUps } from "@/lib/follow-ups";
import { primaryRecord, STATUS_LABELS, type ChangeGroup } from "@/lib/model";
import { useWorkspace } from "./context";

function FollowUpGroup({
  title,
  problem,
  matched,
  render,
}: {
  title: string;
  problem?: string;
  matched: ChangeGroup[];
  render: (change: ChangeGroup) => ReactNode;
}) {
  return (
    <section className="follow-up-group" aria-label={`${title} 的连续交付`}>
      <h3 className="follow-up-heading">{title}</h3>
      {problem && <p className="follow-up-warning">{problem}</p>}
      {matched.map((change) => (
        <Fragment key={change.id}>{render(change)}</Fragment>
      ))}
    </section>
  );
}

export function GroupedChangeRows({
  changes,
  render,
}: {
  changes: ChangeGroup[];
  render: (change: ChangeGroup) => ReactNode;
}) {
  const { data } = useWorkspace();
  const index = useMemo(
    () => matchingFollowUps(data!.changes, changes),
    [data, changes],
  );
  return [...index.visible].map(([rootId, matched]) => {
    const members = index.groups.get(rootId)!;
    if (members.length > 1)
      return (
        <FollowUpGroup
          key={rootId}
          title={index.titles.get(rootId)!}
          problem={index.titleProblems.get(rootId)}
          {...{ matched, render }}
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
  const { data, nav, sharing } = useWorkspace();
  const index = useMemo(() => followUpIndex(data!.changes), [data]);
  const prior = primaryRecord(change)?.state?.followUpOf;
  const members = index.groups.get(index.roots.get(change.id)!);
  const problem = index.problems.get(change.id);
  if (sharing)
    return prior ? (
      <section className="follow-up-context">
        <h3>连续交付</h3>
        <p>延续自 {prior} · 未分享</p>
      </section>
    ) : null;
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
