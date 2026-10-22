"use client";
import { materialClass } from "./material-styles";

import { Badge, Button, type BadgeTone } from "@open-folio/ui";
import { Popover } from "radix-ui";
import { Tags } from "lucide-react";
import { primaryRecord, type ChangeGroup, type ChangeState } from "@/lib/model";
import { URGENCY_LABELS, type LabelQuery } from "@/lib/change-labels";

const tones: Record<keyof typeof URGENCY_LABELS, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

export function ChangeLabels({
  state,
  detail = false,
}: {
  state: ChangeState | null | undefined;
  detail?: boolean;
}) {
  if (!state) return null;
  const types = state.types ?? [];
  const urgency = state.urgency ?? "normal";
  if (!detail && !types.length && urgency === "normal") return null;
  return (
    <span className={materialClass("change-labels")}>
      {types.map((type) => (
        <Badge key={type}>{type}</Badge>
      ))}
      {detail && !types.length && (
        <span className={materialClass("muted")}>无类型标签</span>
      )}
      {(detail || urgency !== "normal") && (
        <Badge
          className={materialClass("change-urgency")}
          tone={tones[urgency]}
          aria-label={`紧急程度：${URGENCY_LABELS[urgency]}`}
        >
          {URGENCY_LABELS[urgency]}
        </Badge>
      )}
    </span>
  );
}
