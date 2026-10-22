// 顶栏“同步状态”：由在线状态、读取进度与最近一次错误码派生，不额外请求。
export type SyncTone = "ok" | "busy" | "offline" | "error";
export type SyncStatus = { tone: SyncTone; label: string; detail?: string };
const TOKEN_CODES = new Set(["TOKEN_INVALID", "IDENTITY_CHANGED"]);
const DENIED_CODES = new Set([
  "READ_DENIED",
  "REPOSITORY_MISMATCH",
  "CONNECTION_CHANGED",
  "SESSION_REQUIRED",
]);
export const NETWORK_ERROR = "NETWORK";

export function syncStatus(input: {
  online: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  errorCode?: string;
}): SyncStatus {
  const { online, loading, refreshing, error, errorCode } = input;
  if (!online || errorCode === NETWORK_ERROR)
    return {
      tone: "offline",
      label: "离线",
      detail: "网络不可用，显示的是上次读取的内容，恢复后自动更新。",
    };
  if (loading || refreshing) return { tone: "busy", label: "正在读取" };
  if (errorCode && TOKEN_CODES.has(errorCode))
    return { tone: "error", label: "Token 失效", detail: error };
  if (errorCode && DENIED_CODES.has(errorCode))
    return { tone: "error", label: "无权限", detail: error };
  if (error) return { tone: "error", label: "同步失败", detail: error };
  return { tone: "ok", label: "已同步" };
}
