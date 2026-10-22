"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 页面把自己的顶栏内容渲染到壳层顶栏的左右插槽，状态仍留在页面组件内。
export type ToolbarSlots = {
  left: HTMLElement | null;
  right: HTMLElement | null;
};
export const ToolbarSlotContext = createContext<ToolbarSlots>({
  left: null,
  right: null,
});
export function ToolbarSlot({
  side,
  children,
}: {
  side: "left" | "right";
  children: ReactNode;
}) {
  const target = useContext(ToolbarSlotContext)[side];
  return target ? createPortal(children, target) : null;
}
