"use client";

// Adapted from shadcn/ui Popover (MIT)：锚定触发控件的玻璃浮层，Escape 关闭并回到触发控件。
import type { ComponentProps } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "../utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...props}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        data-slot="popover-content"
        className={cn("of-ui-floating of-ui-popover", className)}
      />
    </PopoverPrimitive.Portal>
  );
}
