"use client";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "./context";
import { ChangeDirectory } from "./change-directory";
import { ChangeReading } from "./change-reading";
import {
  readDirectoryQuery,
  directoryQueryParams,
} from "@/lib/change-directory";
import { legacyChangesPatch } from "@/lib/legacy-query";
export default function Changes() {
  const { q, nav } = useWorkspace();
  const query = useMemo(() => readDirectoryQuery(q), [q]);
  useEffect(() => {
    const patch: Record<string, string | null> = {
      ...directoryQueryParams(query),
      ...(legacyChangesPatch(q) ?? {}),
    };
    if (
      q.scope &&
      !["active", "completed", "cancelled"].includes(q.scope) &&
      !["issues", "pendingIntegration", "pendingRelease"].includes(q.scope)
    )
      patch.scope = null;
    if (q.group && !["status", "stage", "none"].includes(q.group))
      patch.group = null;
    if (query.scope !== "active" && q.view === "board") patch.view = null;
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
  return q.c ? (
    <ChangeReading
      onBack={() => {
        previous.current = q.c;
        nav({
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
