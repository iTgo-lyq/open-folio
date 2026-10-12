"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import type {
  SessionSummary,
  ConnectionSummary,
  WorkspacePreferences,
} from "@/server/personal-sessions";
import type { ConnectionDescriptor } from "@/server/providers/types";
import type { DiscoveredRepository } from "@/server/discovery";
import type { DiscoverySummary } from "@/lib/personal";
import { api } from "./api";
export type PersonalSession = SessionSummary & {
  providers: ConnectionDescriptor[];
};
type PersonalValue = {
  session: PersonalSession | null;
  sessionError: string;
  connection: ConnectionSummary | undefined;
  updatePreferences: (patch: WorkspacePreferences) => Promise<void>;
  reloadSession: (select?: string) => Promise<void>;
  items: DiscoveredRepository[];
  discovery: DiscoverySummary | null;
  directoryError: string;
  listing: boolean;
  unavailable: number;
  more: boolean;
  loadMore: () => void;
  rediscover: (retry?: boolean) => Promise<void>;
  reloadDirectory: () => void;
  epoch: number;
};
const Personal = createContext<PersonalValue | null>(null);
export const usePersonal = () => useContext(Personal)!;
export function PersonalProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PersonalSession | null>(null),
    [sessionError, setSessionError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [items, setItems] = useState<DiscoveredRepository[]>([]),
    [discovery, setDiscovery] = useState<DiscoverySummary | null>(null),
    [directoryError, setDirectoryError] = useState(""),
    [listing, setListing] = useState(false),
    [unavailable, setUnavailable] = useState(0),
    [more, setMore] = useState<number | null>(null),
    [version, setVersion] = useState(0),
    [cursor, setCursor] = useState(0);
  const snapshot = useRef<PersonalSession | null>(null),
    sequence = useRef(0);
  const connection: ConnectionSummary | undefined = session?.workspace
    ? {
        id: session.workspace.id,
        identity: session.workspace.identity,
        label: session.workspace.label,
        revision: 1,
      }
    : undefined;
  const recover = useCallback(async (explicit = false) => {
    const version = ++sequence.current;
    if (explicit) {
      snapshot.current = null;
      setEpoch((v) => v + 1);
      setItems([]);
      setSession(null);
    }
    try {
      const next = await api<PersonalSession>("/api/session");
      if (version !== sequence.current) return;
      if (
        snapshot.current?.deviceSessionId !== next.deviceSessionId ||
        snapshot.current?.workspace?.id !== next.workspace?.id
      ) {
        setEpoch((v) => v + 1);
        setItems([]);
      }
      snapshot.current = next;
      setSession(next);
      setSessionError("");
    } catch (e) {
      if (version !== sequence.current) return;
      snapshot.current = null;
      setSession(null);
      setItems([]);
      setEpoch((v) => v + 1);
      setSessionError((e as Error).message);
    }
  }, []);
  const reloadSession = useCallback(
    async (_select?: string) => recover(true),
    [recover],
  );
  useEffect(() => {
    void recover();
    const check = () => {
      if (document.visibilityState === "visible") void recover();
    };
    const timer = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      sequence.current++;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [recover]);
  const updatePreferences = useCallback(async (patch: WorkspacePreferences) => {
    const current = snapshot.current?.workspace,
      version = sequence.current;
    if (!current) return;
    await api("/api/session/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-OpenFolio-Workspace": current.id,
      },
      body: JSON.stringify(patch),
    });
    if (
      sequence.current === version &&
      snapshot.current?.workspace?.id === current.id
    ) {
      const next = {
        ...snapshot.current,
        workspace: {
          ...snapshot.current.workspace,
          preferences: { ...snapshot.current.workspace.preferences, ...patch },
        },
      };
      snapshot.current = next;
      setSession(next);
    }
  }, []);
  const reloadDirectory = useCallback(() => {
    setCursor(0);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    setItems([]);
    setDiscovery(null);
    setDirectoryError("");
    setMore(null);
    setCursor(0);
  }, [connection?.id, connection?.revision]);
  useEffect(() => {
    if (!connection) {
      setListing(false);
      return;
    }
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let last = "";
    const load = async () => {
      setListing(true);
      try {
        const status = await api<{ discovery: DiscoverySummary | null }>(
          `/api/connections/${connection.id}/discovery`,
          { signal: c.signal },
        );
        if (c.signal.aborted) return;
        setDiscovery(status.discovery);
        if (last !== status.discovery?.updatedAt || !last) {
          const page = await api<{
            items: DiscoveredRepository[];
            nextOffset: number | null;
            unavailable: number;
          }>(
            `/api/repositories?connectionId=${connection.id}&cursor=${cursor}`,
            { signal: c.signal },
          );
          if (c.signal.aborted) return;
          setItems((old) =>
            cursor
              ? [
                  ...old.filter(
                    (i) => !page.items.some((n) => n.key === i.key),
                  ),
                  ...page.items,
                ]
              : page.items,
          );
          setMore(page.nextOffset);
          setUnavailable(page.unavailable);
          setDirectoryError("");
          last = status.discovery?.updatedAt ?? "idle";
        }
        if (status.discovery?.state === "running")
          timer = setTimeout(() => void load(), 2500);
      } catch (e) {
        if (!c.signal.aborted) {
          setItems([]);
          setDirectoryError((e as Error).message);
        }
      } finally {
        if (!c.signal.aborted) setListing(false);
      }
    };
    void load();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [connection?.id, connection?.revision, epoch, version, cursor]);
  const rediscover = useCallback(
    async (retry = false) => {
      if (!connection) return;
      await api(`/api/connections/${connection.id}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry }),
      });
      reloadDirectory();
    },
    [connection, reloadDirectory],
  );
  return (
    <Personal.Provider
      value={{
        session,
        sessionError,
        connection,
        updatePreferences,
        reloadSession,
        items,
        discovery,
        directoryError,
        listing,
        unavailable,
        more: more !== null,
        loadMore: () => {
          if (more !== null) setCursor(more);
        },
        rediscover,
        reloadDirectory,
        epoch,
      }}
    >
      {children}
    </Personal.Provider>
  );
}
