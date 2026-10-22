"use client";

// 分段控件：单选语义（radio），方向键在选项间移动并切换。
import type { ReactNode } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "../utils";

export type SegmentedItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** 只有图标时提供可朗读名称。 */
  ariaLabel?: string;
  disabled?: boolean;
};
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  items,
  label,
  size = "md",
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: SegmentedItem<T>[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={label}
      orientation="horizontal"
      data-size={size}
      className={cn("of-ui-segmented", className)}
    >
      {items.map((item) => (
        <RadioGroupPrimitive.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          aria-label={item.ariaLabel}
          className="of-ui-segmented-item"
        >
          {item.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
