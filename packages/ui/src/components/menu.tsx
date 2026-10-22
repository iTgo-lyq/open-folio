"use client";

// Adapted from shadcn/ui Dropdown Menu (MIT)：玻璃浮层菜单，支持普通、单选与多选项。
import type { ComponentProps } from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cn } from "../utils";

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuGroup = MenuPrimitive.Group;
export const MenuRadioGroup = MenuPrimitive.RadioGroup;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        {...props}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        data-slot="menu-content"
        className={cn("of-ui-floating of-ui-menu", className)}
      />
    </MenuPrimitive.Portal>
  );
}
export function MenuItem({
  className,
  tone,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { tone?: "danger" }) {
  return (
    <MenuPrimitive.Item
      {...props}
      data-slot="menu-item"
      data-tone={tone}
      className={cn("of-ui-menu-item", className)}
    />
  );
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function MenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem
      {...props}
      data-slot="menu-checkbox-item"
      className={cn("of-ui-menu-item", className)}
    >
      <span className="of-ui-menu-check" data-kind="box">
        <MenuPrimitive.ItemIndicator>
          <Check />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}
export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      {...props}
      data-slot="menu-radio-item"
      className={cn("of-ui-menu-item", className)}
    >
      {children}
      <span className="of-ui-menu-check" data-kind="mark">
        <MenuPrimitive.ItemIndicator>
          <Check />
        </MenuPrimitive.ItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  );
}
export function MenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      {...props}
      data-slot="menu-label"
      className={cn("of-ui-menu-label", className)}
    />
  );
}
export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      {...props}
      data-slot="menu-separator"
      className={cn("of-ui-menu-separator", className)}
    />
  );
}
