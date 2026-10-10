"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DocumentRef, ProjectSummary, Workbench } from "@/lib/model";
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.code ?? "FAILED",
      data.error?.message ?? "读取失败。",
    );
  return data;
}
export type Query = Record<string, string>;
type Value = {
  q: Query;
  revealVersion: number;
  nav: (patch: Record<string, string | null>, replace?: boolean) => void;
  projects: ProjectSummary[];
  projectId: string;
  data: Workbench | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
  openDocument: (id: string, anchor?: string, raw?: boolean) => void;
  notice: (message: string) => void;
  message: string;
};
const Context = createContext<Value | null>(null);
export const useWorkspace = () => useContext(Context)!;
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState<Query>({}),
    [revealVersion, setRevealVersion] = useState(0),
    [ready, setReady] = useState(false),
    [configured, setConfigured] = useState(false),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [data, setData] = useState<Workbench | null>(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    auto = useRef(new Set<string>()),
    refreshGeneration = useRef(0);
  const nav = useCallback(
    (patch: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch))
        value ? params.set(key, value) : params.delete(key);
      window.history[replace ? "replaceState" : "pushState"](
        {},
        "",
        `?${params}`,
      );
      setQ(Object.fromEntries(params));
      if (Object.hasOwn(patch, "s")) setRevealVersion((v) => v + 1);
    },
    [],
  );
  useEffect(() => {
    const read = () =>
      setQ(Object.fromEntries(new URLSearchParams(window.location.search)));
    read();
    setReady(true);
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    api<{ projects: ProjectSummary[] }>("/api/projects", { signal: c.signal })
      .then((r) => {
        setProjects(r.projects);
        setConfigured(true);
        if (!r.projects.length) setLoading(false);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, []);
  const projectId = q.project || projects[0]?.id || "";
  useEffect(() => {
    if (!ready || !configured || !projectId) return;
    const version = ++generation.current,
      controller = new AbortController();
    ++refreshGeneration.current;
    setRefreshing(false);
    setLoading(true);
    setError(projects.find((p) => p.id === projectId)?.lastError ?? "");
    setData(null);
    const run = async () => {
      const path = `/api/projects/${encodeURIComponent(projectId)}`;
      try {
        let next: Workbench;
        try {
          next = await api<Workbench>(
            `${path}/workbench${q.branch ? `?branch=${encodeURIComponent(q.branch)}` : ""}`,
            { signal: controller.signal },
          );
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.code === "BRANCH_NOT_FOUND" &&
            version === generation.current
          ) {
            nav({ branch: null }, true);
            setMessage("原分支不存在，已返回默认来源。");
            return;
          }
          if (
            !(e instanceof ApiError) ||
            e.code !== "NO_SNAPSHOT" ||
            auto.current.has(projectId)
          )
            throw e;
          auto.current.add(projectId);
          if (version === generation.current) setRefreshing(true);
          await api(`${path}/refresh`, {
            method: "POST",
            signal: controller.signal,
          });
          next = await api<Workbench>(
            `${path}/workbench${q.branch ? `?branch=${encodeURIComponent(q.branch)}` : ""}`,
            { signal: controller.signal },
          );
        }
        if (version === generation.current) setData(next);
      } catch (e) {
        if (!controller.signal.aborted && version === generation.current)
          setError((e as Error).message);
      } finally {
        if (version === generation.current && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void run();
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [ready, configured, projectId, q.branch, nav]);
  const refresh = useCallback(async () => {
    if (!projectId || refreshing) return;
    const version = ++refreshGeneration.current,
      source = generation.current;
    setRefreshing(true);
    setError("");
    try {
      const path = `/api/projects/${encodeURIComponent(projectId)}`;
      const r = await api<{ snapshotId: string }>(`${path}/refresh`, {
        method: "POST",
      });
      let next: Workbench;
      try {
        next = await api<Workbench>(
          `${path}/workbench?snapshot=${r.snapshotId}${q.branch ? `&branch=${encodeURIComponent(q.branch)}` : ""}`,
        );
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== "BRANCH_NOT_FOUND") throw e;
        next = await api<Workbench>(
          `${path}/workbench?snapshot=${r.snapshotId}`,
        );
        if (
          version === refreshGeneration.current &&
          source === generation.current
        ) {
          nav({ branch: null }, true);
          setMessage("原分支已从中心仓库删除，已返回默认来源。");
        }
      }
      if (
        version === refreshGeneration.current &&
        source === generation.current
      ) {
        setData(next);
        setProjects(
          await api<{ projects: ProjectSummary[] }>("/api/projects").then(
            (r) => r.projects,
          ),
        );
      }
    } catch (e) {
      if (
        version === refreshGeneration.current &&
        source === generation.current
      )
        setError((e as Error).message);
    } finally {
      if (version === refreshGeneration.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [projectId, refreshing, q.branch, nav]);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(id);
  }, [message]);
  const openDocument = useCallback(
    (id: string, anchor = "", raw = false) =>
      nav({ doc: id, da: anchor || null, raw: raw ? "1" : null }),
    [nav],
  );
  return (
    <Context.Provider
      value={{
        q,
        revealVersion,
        nav,
        projects,
        projectId,
        data,
        loading,
        refreshing,
        error,
        refresh,
        openDocument,
        notice: setMessage,
        message,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDocument(id: string | undefined) {
  const { data, projectId } = useWorkspace();
  const [value, setValue] = useState<{
      document: DocumentRef;
      body: string;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const snapshot = data?.id;
  useEffect(() => {
    setValue(null);
    setError("");
    if (!id || !snapshot) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    api<{ document: DocumentRef; body: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(id)}?snapshot=${snapshot}`,
      { signal: c.signal },
    )
      .then(setValue)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, snapshot, projectId]);
  // A changing id is hidden immediately, before its next request settles.
  return {
    value:
      value &&
      value.document.id === id &&
      data?.documents.some(
        (d) => d.id === id && d.commit === value.document.commit,
      )
        ? value
        : null,
    error,
    loading,
  };
}
export function useSavedScroll(key: string, anchor?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (anchor) {
      requestAnimationFrame(() =>
        element
          .querySelector(`#${CSS.escape(anchor)}`)
          ?.scrollIntoView({ block: "start" }),
      );
    } else {
      try {
        element.scrollTop = Number(
          sessionStorage.getItem(`openfolio.scroll.${key}`) ?? 0,
        );
      } catch {}
    }
    const save = () => {
      // A detached scroll container reports zero during passive cleanup.
      // Keep the position already captured by its last scroll event.
      if (!element.isConnected) return;
      try {
        sessionStorage.setItem(
          `openfolio.scroll.${key}`,
          String(element.scrollTop),
        );
      } catch {}
    };
    element.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      element.removeEventListener("scroll", save);
    };
  }, [key, anchor]);
  return ref;
}
