import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Tooltip } from "./components/tooltip";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** text 为 ghost 的旧名称，保留给尚未迁移的调用方。 */
  variant?: "default" | "primary" | "ghost" | "danger" | "text";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};
export function Button({
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-size={size}
      className={`of-ui-button of-ui-button--${variant === "text" ? "ghost" : variant} ${className}`}
    >
      {loading && <span className="of-ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export type IconButtonProps = Omit<ButtonProps, "variant" | "size"> & {
  "aria-label": string;
  size?: "sm" | "md";
  /** 悬停与键盘聚焦时显示名称；true 使用 aria-label，触摸时不依赖提示。 */
  tooltip?: boolean | ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
};
export function IconButton({
  className = "",
  tooltip,
  tooltipSide,
  size = "md",
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      {...props}
      variant="ghost"
      className={`of-ui-icon-button ${className}`}
      data-icon-size={size}
    />
  );
  return tooltip ? (
    <Tooltip
      content={tooltip === true ? props["aria-label"] : tooltip}
      side={tooltipSide}
    >
      {button}
    </Tooltip>
  ) : (
    button
  );
}
export type BadgeTone =
  | "neutral"
  | "info"
  | "accent"
  | "success"
  | "warning"
  | "danger";
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };
export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={`of-ui-badge of-ui-badge--${tone} ${className}`}
    />
  );
}
export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};
export function EmptyState({
  title,
  icon,
  action,
  children,
  className = "",
  ...props
}: EmptyStateProps) {
  return (
    <div {...props} className={`of-ui-empty ${className}`}>
      {icon && (
        <div className="of-ui-empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      {children && <div className="of-ui-empty-content">{children}</div>}
      {action && <div className="of-ui-empty-action">{action}</div>}
    </div>
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "./components/card";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
export {
  TabbedCard,
  type TabbedCardProps,
  type TabbedCardItem,
} from "./components/tabbed-card";
export { Input, Textarea } from "./components/input";
export {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "./components/field";
export { BrandMark, type BrandMarkProps } from "./components/brand-mark";
export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuLabel,
  MenuSeparator,
} from "./components/menu";
export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverContent,
  PopoverClose,
} from "./components/popover";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "./components/dialog";
export { Tooltip } from "./components/tooltip";
export { SegmentedControl, type SegmentedItem } from "./components/segmented";
export { Switch } from "./components/switch";
export { Avatar, hueOf } from "./components/avatar";
export { Skeleton } from "./components/skeleton";
