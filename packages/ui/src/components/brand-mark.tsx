import type { SVGProps } from "react";
import { cn } from "../utils";

// OpenFolio 平面标志：按原图几何描成的矢量，外框取当前文字色，内侧面板为同色浅调。
export type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  /** 提供时作为图像朗读；省略时视为装饰。 */
  label?: string;
};
export function BrandMark({
  size = 24,
  label,
  className,
  ...props
}: BrandMarkProps) {
  return (
    <svg
      {...props}
      viewBox="173 182 911 911"
      width={size}
      height={size}
      fill="currentColor"
      focusable="false"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
      className={cn("of-ui-brand-mark", className)}
    >
      <path d="M222 365Q222 319 263 298L440 210Q479 190 522 201L1005 328Q1034 336 1034 366L1034 434Q1034 464 1005 457L454 324Q398 310 398 368L398 885Q398 943 454 927L771 834Q792 828 812 836L951 892Q997 911 950 927L513 1070Q472 1084 433 1063L263 973Q222 951 222 905Z" />
      <path
        d="M733 467Q733 443 756 449L1010 517Q1035 524 1035 550L1035 852Q1035 878 1011 868L755 769Q733 761 733 737Z"
        fillOpacity={0.42}
      />
    </svg>
  );
}
