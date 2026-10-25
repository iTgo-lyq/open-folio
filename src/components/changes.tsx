"use client";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "./context";
import { ChangeDirectory } from "./change-directory";
import { useChangeViews } from "./change-views-context";
import { hasDirectoryQuery, queryToUrl, systemQuery } from "@/lib/change-views";
import { Button } from "@open-folio/ui";
import { Empty } from "./document";
import { ChangeReading } from "./change-reading";
import {
  readDirectoryQuery,
  directoryQueryParams,
  matchesDirectoryScope,
} from "@/lib/change-directory";
import { legacyChangesPatch } from "@/lib/legacy-query";
export default function Changes() {
  const { q, nav, data, projectId } = useWorkspace();
  const views = useChangeViews();
  const cancelled = data?.changes.filter((g) =>
    matchesDirectoryScope(g, "cancelled"),
  ).length;
  const previousCancelled = useRef<{ projectId: string; count: number } | null>(
    null,
  );
  useEffect(() => {
    if (cancelled === undefined) return;
    const last = previousCancelled.current;
    previousCancelled.current = { projectId, count: cancelled };
    if (
      last?.projectId === projectId &&
      last.count > 0 &&
      cancelled === 0 &&
      (!q.changeView || q.changeView === "system:cancelled") &&
      readDirectoryQuery(q).scope === "cancelled"
    )
      nav({ ...queryToUrl(systemQuery()), changeView: "system:active" }, true);
  }, [cancelled, projectId, q, nav]);
  const query = useMemo(() => readDirectoryQuery(q), [q]);
  useEffect(() => {
    const patch: Record<string, string | null> = {
      ...directoryQueryParams(query),
      ...(legacyChangesPatch(q) ?? {}),
    };
    if (q.states === undefined) delete patch.states;
    if (
      q.scope &&
      !["active", "completed", "archived", "cancelled"].includes(q.scope) &&
      !["issues", "pendingIntegration", "pendingRelease"].includes(q.scope)
    )
      patch.scope = null;
    if (q.group && !["status", "stage", "none"].includes(q.group))
      patch.group = null;
    for (const key of Object.keys(patch))
      if ((q[key] ?? null) === patch[key]) delete patch[key];
    if (Object.keys(patch).length) nav(patch, true);
  }, [q, query, nav]);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (q.c || !previous.current) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-change-id="${CSS.escape(previous.current!)}"]`,
        )
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [q.c]);
  if (!hasDirectoryQuery(q) && !views.record)
    return (
      <Empty title={views.error || "正在恢复视图…"}>
        {views.error && (
          <Button onClick={() => void views.reload()}>重试</Button>
        )}
      </Empty>
    );
  return q.c ? (
    <ChangeReading
      onBack={() => {
        previous.current = q.c;
        const { c: _detail, ...directoryContext } = q;
        nav({
          ...(!hasDirectoryQuery(directoryContext)
            ? { ...queryToUrl(systemQuery()), changeView: "system:active" }
            : {}),
          c: null,
          ct: null,
          doc: null,
          da: null,
          raw: null,
          anchor: null,
          preview: null,
          revision: null,
          cf: null,
          cv: null,
        });
      }}
    />
  ) : (
    <ChangeDirectory
      onOpen={(id) => {
        previous.current = id;
      }}
    />
  );
}
