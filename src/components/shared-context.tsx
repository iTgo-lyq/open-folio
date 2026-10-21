"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { primaryRecord, type DocumentRef, type Workbench } from "@/lib/model";
import { shareParams, sharedReadUrl, type ShareTarget } from "@/lib/share-link";
import type { SharedChange } from "@/lib/shared-change";
import { ReadingProvider, type Query } from "./context";
import { api } from "./api";

export function documentLocation(data: Workbench, document: DocumentRef) {
  const primary = primaryRecord(data.changes[0]);
  return primary &&
    document.branch === primary.branch &&
    document.path.startsWith(`${primary.directory}/`)
    ? document.path.slice(primary.directory.length + 1)
    : "@entry/change.json";
}
export function sharedWorkbench(value: SharedChange): Workbench {
  return {
    cacheSchemaVersion: 7,
    id: value.snapshotId,
    capturedAt: value.capturedAt,
    projectName: value.projectName,
    projectId: "",
    fingerprint: "",
    specBranch: null,
    collaborationBranch: null,
    selectedBranch: null,
    protectedBranches: [],
    branches: [],
    routes: [],
    sourceDiagnostics: [],
    specs: [],
    diagnostics: [],
    changes: [value.change],
    documents: value.documents,
    prototype: { status: "unconfigured", branch: null, message: "" },
    currentPrototype: { revision: null, entries: [], issues: [] },
    integrations: {
      version: 1,
      tip: null,
      complete: false,
      records: {},
      issues: [],
    },
  };
}
const allowed = new Set([
  "ct",
  "document",
  "anchor",
  "raw",
  "asset",
  "preview",
  "device",
  "orientation",
  "zoom",
  "cf",
  "cv",
]);
const unavailable = new Set([
  "SHARE_UNAVAILABLE",
  "INVALID_PARAMETER",
  "SHARE_BRANCH_REQUIRED",
  "SHARE_SOURCE_UNAVAILABLE",
]);
export function SharedProvider({
  target,
  children,
}: {
  target: ShareTarget;
  children: React.ReactNode;
}) {
  const id = shareParams(target).toString();
  const [q, setQ] = useState<Query>({});
  const [data, setData] = useState<Workbench | null>(null);
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(""),
    [message, notice] = useState("");
  const pending = useRef<Promise<void> | null>(null),
    generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const nav = useCallback(
    (patch: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      if (Object.hasOwn(patch, "doc") && !patch.doc) params.delete("asset");
      for (const [key, value] of Object.entries(patch))
        if (allowed.has(key))
          value ? params.set(key, value) : params.delete(key);
      for (const key of [...params.keys()])
        if (!allowed.has(key)) params.delete(key);
      for (const [key, value] of shareParams(target)) params.set(key, value);
      window.history[replace ? "replaceState" : "pushState"](
        {},
        "",
        `${window.location.pathname}?${params}`,
      );
      setQ(Object.fromEntries(params));
    },
    [target],
  );
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const version = ++generation.current;
    const c = new AbortController();
    controller.current = c;
    setRefreshing(true);
    const operation = (async () => {
      try {
        const value = await api<SharedChange>(sharedReadUrl(target, "change"), {
          signal: c.signal,
        });
        if (version !== generation.current || c.signal.aborted) return;
        setData((previous) =>
          previous?.id === value.snapshotId ? previous : sharedWorkbench(value),
        );
        setError("");
      } catch (e) {
        if (!c.signal.aborted && version === generation.current) {
          const code = (e as { code?: string }).code;
          if (unavailable.has(code ?? "")) setData(null);
          setError((e as Error).message);
        }
      } finally {
        if (!c.signal.aborted && version === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })().finally(() => {
      if (pending.current === operation) pending.current = null;
    });
    pending.current = operation;
    return operation;
  }, [target]);
  useEffect(() => {
    const read = () =>
      setQ(Object.fromEntries(new URLSearchParams(window.location.search)));
    read();
    window.addEventListener("popstate", read);
    void refresh();
    const check = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const failed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const url = new URL(detail.path, window.location.origin);
      if (
        !url.pathname.startsWith("/api/shared-changes/") ||
        ["repository", "change", "collaborationBranch"].some(
          (key) => url.searchParams.get(key) !== shareParams(target).get(key),
        )
      )
        return;
      if (unavailable.has(detail.code)) {
        generation.current++;
        setData(null);
        setLoading(false);
        setRefreshing(false);
        setError(detail.message ?? "分享已不可用。");
      } else if (detail.code === "SHARE_VERSION_CHANGED") void refresh();
    };
    window.addEventListener("openfolio-share-error", failed);
    return () => {
      controller.current?.abort();
      pending.current = null;
      generation.current++;
      clearInterval(interval);
      window.removeEventListener("popstate", read);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("openfolio-share-error", failed);
    };
  }, [target, refresh]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => notice(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const readUrl = useCallback(
    (path: string) => {
      const [name, query] = path.split("?");
      const scoped = name
        .replace(/^changes\/[^/]+\/integration/, "integration")
        .replace(/^previews\/[^/]+$/, "previews");
      return sharedReadUrl(target, `${scoped}${query ? `?${query}` : ""}`);
    },
    [target],
  );
  const openDocument = useCallback(
    (id: string, anchor = "", raw = false) => {
      const document = data?.documents.find((d) => d.id === id);
      if (!document || !data) {
        notice("这份材料未包含在分享中。");
        return;
      }
      const path = documentLocation(data, document);
      nav(
        document.kind === "image"
          ? { asset: path }
          : {
              ct: "documents",
              document: path,
              anchor: anchor || null,
              raw: raw ? "1" : null,
              asset: null,
            },
      );
    },
    [data, nav],
  );
  const query = useMemo(
    () => ({
      ...q,
      c: data?.changes[0].id ?? "",
      ...(q.asset && data
        ? {
            doc:
              data.documents.find((d) => documentLocation(data, d) === q.asset)
                ?.id ?? "",
          }
        : {}),
    }),
    [q, data],
  );
  return (
    <ReadingProvider.Provider
      value={{
        sharing: true,
        readScope: id,
        q: query,
        revealVersion: 0,
        nav,
        projects: [],
        projectId: id,
        data,
        loading,
        refreshing,
        error,
        refresh,
        locked: false,
        openDocument,
        notice,
        message,
        readUrl,
        selectRepository: () => {},
      }}
    >
      {children}
    </ReadingProvider.Provider>
  );
}
