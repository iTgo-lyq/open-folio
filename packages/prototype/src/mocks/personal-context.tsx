import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { usePersonal as realUsePersonal } from "../../../../src/components/personal-context";
import { ReadingCache } from "../../../../src/components/reading-cache";
import { readSession, updateMockPreferences } from "./api";
import { repositories, timestamp } from "./fixtures";

type PersonalValue = ReturnType<typeof realUsePersonal>;
const Personal = createContext<PersonalValue | null>(null);
export const usePersonal = () => useContext(Personal)!;
export function PersonalProvider({
  children,
  scene,
}: {
  children: ReactNode;
  scene: string;
}) {
  const [epoch, setEpoch] = useState(0);
  const viewsCache = useMemo(() => new ReadingCache(), []);
  const reloadSession = useCallback(async () => {
    setEpoch((value) => value + 1);
  }, []);
  const session = readSession();
  const connection = session.workspace
    ? {
        id: session.workspace.id,
        identity: session.workspace.identity,
        label: session.workspace.label,
        revision: 1,
      }
    : undefined;
  return (
    <Personal.Provider
      value={{
        session,
        connection,
        epoch,
        viewsCache,
        reloadSession,
        sessionError: "",
        restoringConnection: false,
        connectionError: "",
        updatePreferences: async (patch) => {
          updateMockPreferences(patch);
          await reloadSession();
        },
        items:
          scene === "empty"
            ? []
            : repositories.filter(
                (item) =>
                  !session.workspace?.preferences.untrackedRepositories?.[
                    item.key
                  ],
              ),
        discovery: {
          state: scene === "loading" ? "running" : "complete",
          checked: 2,
          found: 2,
          failed: 0,
          hasMore: false,
          updatedAt: timestamp,
        },
        directoryError: scene === "error" ? "演示仓库读取失败。" : "",
        listing: scene === "loading",
        unavailable: 0,
        more: false,
        loadMore: () => {},
        rediscover: async () => {},
        reloadDirectory: () => {},
      }}
    >
      {children}
    </Personal.Provider>
  );
}
