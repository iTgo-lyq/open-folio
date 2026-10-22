"use client";
import { useCallback, useState } from "react";
import { api } from "./api";
import { usePersonal } from "./personal-context";

// 账号菜单与账号页共用：切换 Token、退出登录。失败时保留原选择并返回错误信息。
export function useAccountActions() {
  const p = usePersonal();
  const [busy, setBusy] = useState("");
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setBusy(key);
      try {
        await action();
        await p.reloadSession();
        return "";
      } catch (e) {
        return (e as Error).message;
      } finally {
        setBusy("");
      }
    },
    [p],
  );
  const switchTo = (connectionId: string) =>
    run(connectionId, () =>
      api("/api/session/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      }),
    );
  const logout = (all = false) =>
    run(all ? "logout-all" : "logout", () =>
      api(all ? "/api/session/logout-all" : "/api/session", {
        method: all ? "POST" : "DELETE",
      }),
    );
  return { busy, switchTo, logout };
}
