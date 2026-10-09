"use client";

// Adapted from shadcn/ui Tabs (MIT); see ../../THIRD_PARTY_NOTICES.md.
import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../utils";

export function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      {...props}
      orientation={orientation}
      data-slot="tabs"
      className={cn("of-ui-tabs", className)}
    />
  );
}
export function TabsList({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & {
  variant?: "default" | "line";
}) {
  return (
    <TabsPrimitive.List
      {...props}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn("of-ui-tabs-list", className)}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      data-slot="tabs-trigger"
      className={cn("of-ui-tabs-trigger", className)}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      {...props}
      data-slot="tabs-content"
      className={cn("of-ui-tabs-content", className)}
    />
  );
}
