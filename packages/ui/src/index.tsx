import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "text";
  loading?: boolean;
};
export function Button({
  variant = "default",
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
      className={`of-ui-button of-ui-button--${variant} ${className}`}
    >
      {loading && <span className="of-ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export type IconButtonProps = Omit<ButtonProps, "variant"> & {
  "aria-label": string;
};
export function IconButton({ className = "", ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      variant="text"
      className={`of-ui-icon-button ${className}`}
    />
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
