"use client";

// Adapted from shadcn/ui Dialog 与 Sheet (MIT)。对话框为实底；抽屉外层与标题区为玻璃，阅读区为实底卡片。
import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "../utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className="of-ui-overlay"
    />
  );
}
export function DialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        {...props}
        data-slot="dialog-content"
        className={cn("of-ui-dialog", className)}
      />
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      {...props}
      data-slot="dialog-title"
      className={cn("of-ui-dialog-title", className)}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      {...props}
      data-slot="dialog-description"
      className={cn("of-ui-dialog-description", className)}
    />
  );
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="dialog-footer"
      className={cn("of-ui-dialog-footer", className)}
    />
  );
}
export function SheetContent({
  className,
  side = "right",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "right" | "left" | "bottom";
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        {...props}
        data-slot="sheet-content"
        data-side={side}
        className={cn("of-ui-sheet", className)}
      />
    </DialogPrimitive.Portal>
  );
}
export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sheet-header"
      className={cn("of-ui-sheet-header", className)}
    />
  );
}
export function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      {...props}
      data-slot="sheet-title"
      className={cn("of-ui-sheet-title", className)}
    />
  );
}
export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      {...props}
      data-slot="sheet-description"
      className={cn("of-ui-sheet-description", className)}
    />
  );
}
export function SheetBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sheet-body"
      className={cn("of-ui-sheet-body", className)}
    />
  );
}
