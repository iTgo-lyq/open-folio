// Adapted from shadcn/ui Card (MIT).
import type { ComponentProps } from "react";
import { cn } from "../utils";

export function Card({
  className,
  size = "default",
  ...props
}: ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      {...props}
      data-slot="card"
      data-size={size}
      className={cn("of-ui-card", className)}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-header"
      className={cn("of-ui-card-header", className)}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-title"
      className={cn("of-ui-card-title", className)}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-description"
      className={cn("of-ui-card-description", className)}
    />
  );
}

export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-action"
      className={cn("of-ui-card-action", className)}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-content"
      className={cn("of-ui-card-content", className)}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="card-footer"
      className={cn("of-ui-card-footer", className)}
    />
  );
}
