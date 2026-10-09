/** Join semantic CSS classes; the package does not require Tailwind at runtime. */
export function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
