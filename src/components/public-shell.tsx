"use client";
import { useCallback, useState, type ReactNode } from "react";
import { BrandMark, IconButton } from "@open-folio/ui";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";
import { ToolbarSlotContext, type ToolbarSlots } from "./toolbar-slot";
import styles from "./public-shell.module.css";

export function PublicShell({
  title,
  label,
  actions,
  children,
}: {
  title: string;
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [theme, setTheme] = useTheme();
  const [slots, setSlots] = useState<ToolbarSlots>({ left: null, right: null });
  const left = useCallback(
    (node: HTMLDivElement | null) =>
      setSlots((previous) =>
        previous.left === node ? previous : { ...previous, left: node },
      ),
    [],
  );
  const right = useCallback(
    (node: HTMLDivElement | null) =>
      setSlots((previous) =>
        previous.right === node ? previous : { ...previous, right: node },
      ),
    [],
  );
  return (
    <ToolbarSlotContext value={slots}>
      <div className={styles.shell}>
        <header className={styles.header} aria-label="公开阅读工具栏">
          <BrandMark className={styles.brand} label="OpenFolio" />
          <span className={styles.title} title={title}>
            {title}
          </span>
          {label && <span className={styles.label}>{label}</span>}
          <div className={styles.slot} ref={left} />
          <div className={styles.actions}>
            <div className={styles.slot} ref={right} />
            {actions}
            <IconButton
              aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
              tooltip
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </IconButton>
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </ToolbarSlotContext>
  );
}
