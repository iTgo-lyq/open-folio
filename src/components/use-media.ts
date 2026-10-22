"use client";
import { useSyncExternalStore } from "react";

// 服务端快照固定为 false / 在线，水合后读取浏览器实际值，避免水合不一致。
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export function useOnline() {
  return useSyncExternalStore(
    (onChange) => {
      addEventListener("online", onChange);
      addEventListener("offline", onChange);
      return () => {
        removeEventListener("online", onChange);
        removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
