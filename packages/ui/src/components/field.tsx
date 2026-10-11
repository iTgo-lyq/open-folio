// Adapted from shadcn/ui Field (MIT), using the package's CSS tokens.
import type { ComponentProps } from "react";
import { cn } from "../utils";

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="field-group"
      className={cn("of-ui-field-group", className)}
    />
  );
}
export function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      {...props}
      data-slot="field"
      className={cn("of-ui-field", className)}
    />
  );
}
export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      {...props}
      data-slot="field-label"
      className={cn("of-ui-field-label", className)}
    />
  );
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      {...props}
      data-slot="field-description"
      className={cn("of-ui-field-description", className)}
    />
  );
}
