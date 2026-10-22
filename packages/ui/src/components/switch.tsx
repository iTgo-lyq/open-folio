"use client";

// Adapted from shadcn/ui Switch (MIT)。
import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "../utils";

export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      data-slot="switch"
      className={cn("of-ui-switch", className)}
    >
      <SwitchPrimitive.Thumb className="of-ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
