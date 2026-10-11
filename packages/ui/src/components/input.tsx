// Adapted from shadcn/ui Input and Textarea (MIT).
import type { ComponentProps } from "react";
import { cn } from "../utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      data-slot="input"
      className={cn("of-ui-input", className)}
    />
  );
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      data-slot="textarea"
      className={cn("of-ui-textarea", className)}
    />
  );
}
