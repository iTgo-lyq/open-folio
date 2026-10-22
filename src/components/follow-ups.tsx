"use client";
import { materialClass } from "./material-styles";

import { Button } from "@open-folio/ui";
import { useMemo } from "react";
import { followUpIndex } from "@/lib/follow-ups";
import { primaryRecord, STATUS_LABELS, type ChangeGroup } from "@/lib/model";
import { useWorkspace } from "./context";

export function FollowUpContext({ change }: { change: ChangeGroup }) {
  const { data, nav, sharing } = useWorkspace();
  const index = useMemo(() => followUpIndex(data!.changes), [data]);
  const prior = primaryRecord(change)?.state?.followUpOf;
  const members = index.groups.get(index.roots.get(change.id)!);
  const problem = index.problems.get(change.id);
  if (sharing)
    return prior ? (
      <section className={materialClass("follow-up-context")}>
        <h3>连续交付</h3>
        <p>延续自 {prior} · 不在本页范围内</p>
      </section>
    ) : null;
  if (!problem && !prior && (!members || members.length < 2)) return null;
  return (
    <section
      className={materialClass("follow-up-context")}
      aria-label="连续交付"
    >
      <h3>连续交付</h3>
      {problem ? (
        <p className={materialClass("warning-text")}>
          延续关系不可用：{problem}
        </p>
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
