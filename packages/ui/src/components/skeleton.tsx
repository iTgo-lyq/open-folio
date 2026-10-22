import type { ComponentProps } from "react";
import { cn } from "../utils";

// Adapted from shadcn/ui Skeleton (MIT)：读取中占位，不承载可读内容。
export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      {...props}
      data-slot="skeleton"
      className={cn("of-ui-skeleton", className)}
    />
  );
}
