"use client";

// Adapted from shadcn/ui Tooltip (MIT)：悬停或键盘聚焦时显示名称，触摸操作不依赖提示。
import type { ComponentProps, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../utils";

export function Tooltip({
  content,
  side = "bottom",
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitive.Content>, "content"> & {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            {...props}
            side={side}
            sideOffset={6}
            collisionPadding={8}
            data-slot="tooltip-content"
            className={cn("of-ui-tooltip", className)}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
