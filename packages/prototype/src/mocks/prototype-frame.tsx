import { useState, type ComponentProps, type ReactEventHandler } from "react";
import { thumbnail } from "./fixtures";

export function PrototypeFrame({
  title,
  width,
  height,
  style,
  onLoad,
}: ComponentProps<"iframe">) {
  const [saved, setSaved] = useState(false);
  return (
    <div
      role="region"
      aria-label={title}
      data-mock-preview
      style={{
        width,
        height,
        ...style,
        transformOrigin: "top left",
        overflow: "auto",
        background: "#e5ede7",
        color: "#264d3b",
        padding: 24,
      }}
    >
      <img
        src={thumbnail}
        alt="Atlas 虚构行程封面"
        style={{ width: "100%", maxHeight: 240, objectFit: "cover" }}
        onLoad={onLoad as unknown as ReactEventHandler<HTMLImageElement>}
      />
      <h1>Atlas 行程表单</h1>
      <p>资源边界 mock · 不加载外部页面</p>
      <button
        type="button"
        onClick={() => setSaved(!saved)}
        style={{
          padding: 12,
          border: "1px solid currentColor",
          borderRadius: 8,
        }}
      >
        {saved ? "已保存到本页内存" : "保存演示行程"}
      </button>
    </div>
  );
}
