import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ReadingContext, Query } from "../../../../src/components/context";
import { ReadingCache } from "../../../../src/components/reading-cache";
import { bodies, makeWorkbench, repository } from "./fixtures";
export { api, ApiError } from "./api";
const Context = createContext<ReadingContext | null>(null);
export const useWorkspace = () => useContext(Context)!;
const readUrl = (path: string) => `/mock/${path}`;
export function FragmentProvider({
  children,
  module,
  scene,
  sharing = false,
}: {
  children: ReactNode;
  module: string;
  scene: string;
  sharing?: boolean;
}) {
  const [q, setQuery] = useState<Query>({
    m: module,
    repo: "atlas",
    ...(sharing ? { c: "offline-map", ct: "requirement" } : {}),
  });
  const [message, notice] = useState("");
  const cache = useMemo(() => new ReadingCache(), []);
  const data = useMemo(() => makeWorkbench(scene === "empty"), [scene]);
  const nav = useCallback(
    (patch: Record<string, string | null>) => {
      if (patch.m && patch.m !== module) {
        notice("这是独立页面片段，请通过各入口查看其他场景。");
        return;
      }
      setQuery((previous) => {
        const next = { ...previous };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") delete next[key];
          else next[key] = value;
        }
        return JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next;
      });
    },
    [module],
  );
  return (
    <Context.Provider
      value={{
        cache,
        data,
        q,
        nav,
        message,
        notice,
        sharing,
        readUrl,
        repository,
        projectId: "atlas",
        projects: [{ id: "atlas", name: repository.fullName }],
        revealVersion: 0,
        loading: scene === "loading",
        refreshing: false,
        locked: false,
        error: scene === "error" ? "演示同步失败，保留上次内容。" : "",
        refresh: async () => notice("演示刷新完成；未访问后端。"),
        openDocument: (id, anchor, raw) =>
          nav({ doc: id, da: anchor ?? null, raw: raw ? "1" : null }),
        selectRepository: () => notice("演示仓库选择；片段不启动应用路由。"),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDocument(id: string | undefined) {
  const { data } = useWorkspace();
  const document = data?.documents.find((item) => item.id === id);
  return {
    value: document ? { document, body: bodies[document.id] ?? "" } : null,
    loading: false,
    error: "",
  };
}
export function useSavedScroll(pageKey: string, anchor?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (anchor)
      ref.current
        ?.querySelector(`#${CSS.escape(anchor)}`)
        ?.scrollIntoView({ block: "start" });
  }, [pageKey, anchor]);
  return ref;
}
