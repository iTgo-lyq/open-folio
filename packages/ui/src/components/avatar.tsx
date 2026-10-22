import type { ComponentProps } from "react";
import { cn } from "../utils";

// 人员头像与仓库字标：不加载外部图片，按名称稳定取色，饱和度保持克制。
export function hueOf(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
export function Avatar({
  name,
  size = "sm",
  shape = "circle",
  hue,
  className,
  style,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "square";
  hue?: number;
}) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      {...props}
      data-size={size}
      data-shape={shape}
      className={cn("of-ui-avatar", className)}
      style={{ ["--of-avatar-hue" as string]: hue ?? hueOf(name), ...style }}
    >
      {initial}
    </span>
  );
}
