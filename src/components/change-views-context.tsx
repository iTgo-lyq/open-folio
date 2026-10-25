"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWorkspace } from "./context";
import { usePersonal } from "./personal-context";
import { api, ApiError } from "./api";
import {
  hasDirectoryQuery,
  queryToUrl,
  selectedQuery,
  selectionKey,
  validSelection,
  type RepositoryViews,
  type SavedChangeView,
  type SelectedView,
} from "@/lib/change-views";

type ViewContext = {
  record: RepositoryViews | undefined;
  error: string;
  loading: boolean;
  reload: () => Promise<RepositoryViews | undefined>;
  select: (selected: SelectedView, replace?: boolean) => void;
  save: (
    revision: number,
    views: SavedChangeView[],
    selectAfterSave?: string,
  ) => Promise<RepositoryViews>;
};
const Context = createContext<ViewContext | null>(null);
export const useChangeViews = () => useContext(Context)!;
export function ChangeViewsProvider({ children }: { children: ReactNode }) {
  const { projectId } = useWorkspace();
  const personal = usePersonal();
  const scope = `${personal.session?.deviceSessionId}:${personal.connection?.id}:${personal.epoch}:${projectId}`;
  return <ScopedViews key={scope}>{children}</ScopedViews>;
}
function ScopedViews({ children }: { children: ReactNode }) {
  const { projectId, q, nav, readUrl, notice } = useWorkspace();
  const personal = usePersonal();
  const enabled = !!projectId && !!personal.connection && q.m === "changes";
  const key = `${personal.session?.account?.id}:${projectId}`;
  const cache = personal.viewsCache;
  const [record, setRecord] = useState(() => cache.get<RepositoryViews>(key));
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const latest = useRef({ q, record, nav });
  latest.current = { q, record, nav };
  const selectedPending = useRef<SelectedView | undefined>(undefined);
  const selecting = useRef(false);
  useEffect(() => {
    controller.current = new AbortController();
    return () => {
      controller.current?.abort();
      sequence.current++;
    };
  }, []);
  const reloadSession = personal.reloadSession;
  const reconcile = useCallback(
    async (cause: unknown) => {
      if (
        cause instanceof ApiError &&
        [
          "SESSION_CHANGED",
          "SESSION_REQUIRED",
          "CONNECTION_CHANGED",
          "CONNECTION_NOT_FOUND",
          "IDENTITY_CHANGED",
          "TOKEN_INVALID",
          "READ_DENIED",
          "REPOSITORY_MISMATCH",
        ].includes(cause.code)
      ) {
        cache.clear();
        setRecord(undefined);
        await reloadSession();
      }
    },
    [cache, reloadSession],
  );
  const apply = useCallback(
    (next: RepositoryViews) => {
      latest.current.record = next;
      cache.set(key, next);
      setRecord(next);
    },
    [cache, key],
  );
  const reload = useCallback(async () => {
    if (!enabled) return;
    const version = ++sequence.current;
    try {
      let next = await api<RepositoryViews | null>(readUrl("change-views"), {
        signal: controller.current!.signal,
      });
      if (!next)
        next = await api<RepositoryViews>(readUrl("change-views"), {
          method: "POST",
          signal: controller.current!.signal,
        });
      if (version !== sequence.current || controller.current?.signal.aborted)
        return;
      const previous = latest.current.record;
      apply(next);
      setError("");
      if (previous && previous.revision !== next.revision)
        notice("视图已更新，重新选择视图可应用最新条件。");
      const current = latest.current.q.changeView;
      if (
        current &&
        previous?.views.some((v) => v.id === current && !v.hidden) &&
        !next.views.some((v) => v.id === current && !v.hidden)
      ) {
        const fallback = validSelection(next.views, {
          kind: "personal",
          id: current,
        });
        latest.current.nav(
          {
            ...queryToUrl(selectedQuery(next, fallback)!),
            changeView: selectionKey(fallback),
          },
          true,
        );
      }
      return next;
    } catch (cause) {
      await reconcile(cause);
      if (version === sequence.current && !controller.current?.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "视图读取失败，请重试。",
        );
    }
  }, [enabled, readUrl, apply, notice, reconcile]);
  useEffect(() => {
    if (!enabled) return;
    void reload();
    const focus = () => {
      void reload();
    };
    window.addEventListener("focus", focus);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", focus);
    };
  }, [enabled, reload]);
  useEffect(() => {
    if (!enabled || !record || hasDirectoryQuery(q)) return;
    const selected = validSelection(record.views, record.selected);
    nav(
      {
        ...queryToUrl(selectedQuery(record, selected)!),
        changeView: selectionKey(selected),
      },
      true,
    );
  }, [enabled, record, q, nav]);
  const select = (selected: SelectedView, replace = false) => {
    const query = record && selectedQuery(record, selected);
    if (!query) return;
    nav({ ...queryToUrl(query), changeView: selectionKey(selected) }, replace);
    selectedPending.current = selected;
    if (selecting.current) return;
    selecting.current = true;
    void (async () => {
      try {
        while (selectedPending.current && !controller.current?.signal.aborted) {
          const target = selectedPending.current;
          selectedPending.current = undefined;
          const next = await api<RepositoryViews>(readUrl("change-views"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selected: target }),
            signal: controller.current!.signal,
          });
          if (controller.current?.signal.aborted) return;
          // A selection reply never replaces definitions or navigates the page.
          const current = latest.current.record;
          if (current) apply({ ...current, selected: next.selected });
          setError("");
        }
      } catch (cause) {
        await reconcile(cause);
        if (!controller.current?.signal.aborted)
          setError(
            cause instanceof Error
              ? `最近选择未保存：${cause.message}`
              : "最近选择未保存，请重试。",
          );
      } finally {
        selecting.current = false;
      }
    })();
  };
  const save: ViewContext["save"] = async (
    expectedRevision,
    views,
    selectAfterSave,
  ) => {
    sequence.current++;
    const next = await api<RepositoryViews>(readUrl("change-views"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, views, selectAfterSave }),
      signal: controller.current!.signal,
    }).catch(async (cause) => {
      await reconcile(cause);
      throw cause;
    });
    controller.current!.signal.throwIfAborted();
    const current = latest.current.q.changeView;
    const removed =
      current &&
      latest.current.record?.views.some((v) => v.id === current && !v.hidden) &&
      !next.views.some((v) => v.id === current && !v.hidden);
    apply(next);
    setError("");
    if (selectAfterSave || removed) {
      const selected = selectAfterSave
        ? { kind: "personal" as const, id: selectAfterSave }
        : validSelection(next.views, { kind: "personal", id: current! });
      nav({
        ...queryToUrl(selectedQuery(next, selected)!),
        changeView: selectionKey(selected),
      });
    }
    return next;
  };
  return (
    <Context.Provider
      value={{
        record,
        error,
        loading: enabled && !record && !error,
        reload,
        select,
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
