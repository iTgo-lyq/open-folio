"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  SessionSummary,
  ConnectionSummary,
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
  selectConnection: (id: string) => void;
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
    [selected, setSelected] = useState(""),
    [epoch, setEpoch] = useState(0),
    [items, setItems] = useState<DiscoveredRepository[]>([]),
    [discovery, setDiscovery] = useState<DiscoverySummary | null>(null),
    [directoryError, setDirectoryError] = useState(""),
    [listing, setListing] = useState(false),
    [unavailable, setUnavailable] = useState(0),
    [more, setMore] = useState<number | null>(null),
    [version, setVersion] = useState(0),
    [cursor, setCursor] = useState(0);
  const connection = session?.connections.find((c) => c.id === selected);
  const reloadSession = useCallback(async (select?: string) => {
    setEpoch((v) => v + 1);
    setItems([]);
    setSessionError("");
    try {
      const next = await api<PersonalSession>("/api/session");
      setSession(next);
      setSelected((current) =>
        select && next.connections.some((c) => c.id === select)
          ? select
          : next.connections.some((c) => c.id === current)
            ? current
            : next.connections.length === 1
              ? next.connections[0].id
              : "",
      );
    } catch (e) {
      setSession(null);
      setSessionError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);
  const selectConnection = useCallback((id: string) => {
    setEpoch((v) => v + 1);
    setItems([]);
    setSelected(id);
    setCursor(0);
    setMore(null);
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
        selectConnection,
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
