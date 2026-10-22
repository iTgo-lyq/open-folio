"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DocumentRef, ProjectSummary, Workbench } from "@/lib/model";
import { SUGGESTED_INTEGRATION_BRANCH } from "@/lib/collaboration";
import { AUTO_REFRESH_MS } from "@/lib/model";
import { NETWORK_ERROR } from "@/lib/sync-status";
import type { RepositoryIdentity } from "@/server/providers/types";
import { api, ApiError } from "./api";
import { usePersonal } from "./personal-context";
export { api, ApiError } from "./api";
export type Query = Record<string, string>;
export type ReadingContext = {
  sharing?: boolean;
  readScope?: string;
  q: Query;
  revealVersion: number;
  nav: (patch: Record<string, string | null>, replace?: boolean) => void;
  projects: ProjectSummary[];
  projectId: string;
  data: Workbench | null;
  repository?: RepositoryIdentity;
  loading: boolean;
  refreshing: boolean;
  error: string;
  /** 最近一次错误的分类码：接口错误码、网络失败为 NETWORK，否则省略。 */
  errorCode?: string;
  refresh: () => Promise<void>;
  locked: boolean;
  openDocument: (id: string, anchor?: string, raw?: boolean) => void;
  notice: (message: string) => void;
  message: string;
  readUrl: (path: string) => string;
  selectRepository: (
    key: string,
    repository?: RepositoryIdentity,
    integrationBranch?: string,
  ) => void;
};
export const ReadingProvider = createContext<ReadingContext | null>(null);
const Context = ReadingProvider;
export const useWorkspace = () => useContext(Context)!;
function errorCodeOf(cause: unknown) {
  if (cause instanceof ApiError) return cause.code;
  return cause instanceof TypeError ? NETWORK_ERROR : "FAILED";
}
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const personal = usePersonal();
  const [q, setQ] = useState<Query>({}),
    [ready, setReady] = useState(false),
    [revealVersion, setRevealVersion] = useState(0),
    [loaded, setLoaded] = useState<{
      key: string;
      value: Workbench & { repository?: RepositoryIdentity };
    } | null>(null),
    [loading, setLoading] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [failure, setFailure] = useState({ message: "", code: "" }),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0);
  const setError = (message: string, cause?: unknown) =>
    setFailure({ message, code: message ? errorCodeOf(cause) : "" });
  const generation = useRef(0),
    active = useRef<AbortController | null>(null);
  const projectId = q.repo ?? "",
    connection = personal.connection;
  const integrationBranch =
    q.integrationBranch ??
    personal.items.find((r) => r.key === projectId)?.integrationBranch ??
    SUGGESTED_INTEGRATION_BRANCH;
  const scope = `${connection?.id ?? ""}:${connection?.revision ?? ""}:${personal.epoch}:${projectId}:${integrationBranch}`;
  const data = loaded?.key === scope ? loaded.value : null;
  const repository =
    data?.repository ??
    personal.items.find((r) => r.key === projectId)?.repository;
  const nav = useCallback(
    (patch: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      if (Object.hasOwn(patch, "c") && patch.c !== params.get("c")) {
        params.delete("cf");
        params.delete("cv");
      }
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
    const read = () => {
      setQ(Object.fromEntries(new URLSearchParams(window.location.search)));
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const restored = useRef("");
  useEffect(() => {
    const workspace = personal.session?.workspace;
    if (!ready || !workspace || restored.current === workspace.id) return;
    restored.current = workspace.id;
    const before = window.location.search,
      preferences = workspace.preferences;
    if (before || !preferences.repository) return;
    let stopped = false;
    const r = preferences.repository;
    void crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([r.providerId, r.instanceId, r.repositoryId]),
        ),
      )
      .then((bytes) => {
        if (stopped || window.location.search !== before) return;
        const key = Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        nav(
          {
            repo: key,
            provider: r.providerId,
            instance: r.instanceId,
            repositoryId: r.repositoryId,
            fullName: r.fullName,
            integrationBranch:
              r.integrationBranch ?? SUGGESTED_INTEGRATION_BRANCH,
            m: preferences.module ?? "specs",
          },
          true,
        );
      });
    return () => {
      stopped = true;
    };
  }, [ready, personal.session?.workspace?.id, nav]);
  const savedPosition = useRef("");
  useEffect(() => {
    const r = data?.repository;
    if (!r || !["specs", "changes", "prototypes"].includes(q.m)) return;
    const signature = JSON.stringify([
      connection?.id,
      r.repositoryId,
      integrationBranch,
      q.m,
    ]);
    if (savedPosition.current === signature) return;
    savedPosition.current = signature;
    void personal
      .updatePreferences({
        repository: {
          providerId: r.providerId,
          instanceId: r.instanceId,
          repositoryId: r.repositoryId,
          fullName: r.fullName,
          integrationBranch,
        },
        module: q.m as "specs" | "changes" | "prototypes",
      })
      .catch((e) => {
        savedPosition.current = "";
        setMessage(e.message);
      });
  }, [
    data?.repository,
    q.m,
    connection?.id,
    integrationBranch,
    personal.updatePreferences,
  ]);
  const readUrl = useCallback(
    (path: string) => {
      const [name, query] = path.split("?");
      const params = new URLSearchParams(query);
      params.set("connectionId", connection?.id ?? "");
      params.set("integrationBranch", integrationBranch);
      if (q.repositoryId && q.fullName) {
        params.set("repositoryId", q.repositoryId);
        params.set("fullName", q.fullName);
      }
      return `/api/repositories/${encodeURIComponent(projectId)}/${name}?${params}`;
    },
    [connection?.id, projectId, integrationBranch, q.repositoryId, q.fullName],
  );
  const selectRepository = useCallback(
    (
      key: string,
      checkedRepository?: RepositoryIdentity,
      selectedBranch?: string,
    ) => {
      const item = checkedRepository
        ? {
            repository: checkedRepository,
            integrationBranch: selectedBranch ?? SUGGESTED_INTEGRATION_BRANCH,
          }
        : personal.items.find((r) => r.key === key);
      if (!item) return;
      const params: Record<string, string | null> = Object.fromEntries(
        Object.keys(q).map((k) => [k, null]),
      );
      nav({
        ...params,
        repo: key,
        provider: item.repository.providerId,
        instance: item.repository.instanceId,
        repositoryId: item.repository.repositoryId,
        fullName: item.repository.fullName,
        integrationBranch: item.integrationBranch,
        m: ["specs", "changes", "prototypes"].includes(q.m) ? q.m : "specs",
      });
    },
    [personal.items, q, nav],
  );
  useEffect(() => {
    const clear = () => {
      active.current?.abort();
      generation.current++;
      setLoaded(null);
      setLoading(false);
      setRefreshing(false);
      setError(
        "读取权限暂时无法确认，请重试或切换凭据。",
        new ApiError("READ_DENIED", ""),
      );
    };
    window.addEventListener("openfolio-read-denied", clear);
    return () => window.removeEventListener("openfolio-read-denied", clear);
  }, []);
  useEffect(() => {
    setLoaded(null);
    setError("");
    setRefreshing(false);
    if (
      !ready ||
      !connection ||
      !projectId ||
      ["home", "connections"].includes(q.m ?? "home")
    ) {
      setLoading(false);
      return;
    }
    const c = new AbortController(),
      version = ++generation.current;
    active.current = c;
    setLoading(true);
    const read = async () => {
      try {
        let next: Workbench;
        try {
          next = await api<Workbench>(readUrl("workbench"), {
            signal: c.signal,
          });
        } catch (e) {
          if (
            !(e instanceof ApiError) ||
            !["NO_SNAPSHOT", "CACHE_INVALID"].includes(e.code)
          )
            throw e;
          setRefreshing(true);
          await api(readUrl("refresh"), { method: "POST", signal: c.signal });
          next = await api<Workbench>(readUrl("workbench"), {
            signal: c.signal,
          });
        }
        if (!c.signal.aborted && version === generation.current)
          setLoaded({ key: scope, value: next });
      } catch (e) {
        if (!c.signal.aborted && version === generation.current) {
          setError((e as Error).message, e);
        }
      } finally {
        if (!c.signal.aborted && version === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void read();
    return () => {
      c.abort();
      generation.current++;
    };
  }, [scope, ready, readUrl, q.m, retry]);
  const hasData = !!data;
  useEffect(() => {
    if (!data || loading || refreshing) return;
    const c = new AbortController(),
      version = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false,
      snapshotId = data.id;
    const check = async () => {
      if (running || c.signal.aborted || document.visibilityState !== "visible")
        return;
      running = true;
      clearTimeout(timer);
      try {
        const result = await api<{ snapshotId: string }>(
          readUrl("refresh?automatic=1"),
          {
            method: "POST",
            signal: c.signal,
          },
        );
        if (result.snapshotId !== snapshotId) {
          const next = await api<Workbench>(readUrl("workbench"), {
            signal: c.signal,
          });
          if (!c.signal.aborted && version === generation.current) {
            snapshotId = next.id;
            setLoaded({ key: scope, value: next });
          }
        }
        if (!c.signal.aborted && version === generation.current) setError("");
      } catch (e) {
        if (!c.signal.aborted && version === generation.current)
          setError(`自动更新失败：${(e as Error).message}`, e);
      } finally {
        running = false;
        if (!c.signal.aborted)
          timer = setTimeout(() => void check(), AUTO_REFRESH_MS);
      }
    };
    void check();
    const resume = () => void check();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      c.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [hasData, scope, loading, refreshing, readUrl, q.m]);
  const refresh = useCallback(async () => {
    if (!projectId || !connection || refreshing) return;
    const version = ++generation.current;
    active.current?.abort();
    const c = new AbortController();
    active.current = c;
    setRefreshing(true);
    setError("");
    try {
      await api(readUrl("refresh"), { method: "POST", signal: c.signal });
      setRetry((v) => v + 1);
    } catch (e) {
      if (!c.signal.aborted && version === generation.current) {
        setError((e as Error).message, e);
      }
    } finally {
      if (version === generation.current) setRefreshing(false);
    }
  }, [projectId, connection, refreshing, readUrl]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const openDocument = useCallback(
    (id: string, anchor = "", raw = false) => {
      const spec = data?.specs.find((spec) => spec.documentId === id);
      if (spec) {
        nav({
          m: "specs",
          s: spec.id,
          c: null,
          ct: null,
          doc: null,
          da: null,
          anchor: anchor || null,
          raw: raw ? "1" : null,
        });
      } else {
        nav({ doc: id, da: anchor || null, raw: raw ? "1" : null });
      }
    },
    [nav, data?.specs],
  );
  return (
    <Context.Provider
      value={{
        q,
        readScope: connection?.id,
        revealVersion,
        nav,
        projects: personal.items.map((r) => ({
          id: r.key,
          name: r.repository.fullName,
        })),
        projectId,
        data,
        repository,
        loading,
        refreshing,
        error: failure.message,
        errorCode: failure.code || undefined,
        refresh,
        locked: !connection,
        openDocument,
        notice: setMessage,
        message,
        readUrl,
        selectRepository,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDocument(id: string | undefined) {
  const { data, projectId, readUrl } = useWorkspace();
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
      readUrl(`documents/${encodeURIComponent(id)}?snapshot=${snapshot}`),
      { signal: c.signal },
    )
      .then((value) => {
        if (!c.signal.aborted) setValue(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, snapshot, projectId, readUrl]);
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
export function useSavedScroll(pageKey: string, anchor?: string) {
  const { readScope, sharing } = useWorkspace();
  const key = `${readScope ?? ""}.${pageKey}`;
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
    } else if (!sharing) {
      try {
        element.scrollTop = Number(
          sessionStorage.getItem(`openfolio.scroll.${key}`) ?? 0,
        );
      } catch {}
    }
    const save = () => {
      // A detached scroll container reports zero during passive cleanup.
      // Keep the position already captured by its last scroll event.
      if (!element.isConnected || sharing) return;
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
  }, [key, anchor, sharing]);
  return ref;
}
