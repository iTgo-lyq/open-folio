"use client";
import { useSyncExternalStore } from "react";
import { readTheme, setTheme, type Theme } from "@/lib/theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

// 服务端快照固定为浅色，水合后读取首帧脚本写入的实际主题，避免水合不一致。
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readTheme,
    () => "light",
  );
  return [theme, setTheme];
}
