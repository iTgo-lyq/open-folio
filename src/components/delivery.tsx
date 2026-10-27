"use client";
import { materialClass } from "./material-styles";
import { Badge, type BadgeTone } from "@open-folio/ui";
import { ArrowUpRight } from "lucide-react";
import type { Delivery, PullRequest } from "@/lib/model";
import { useWorkspace } from "./context";
import { DELIVERY_LABELS as labels } from "@/lib/delivery-labels";
const tones: Record<keyof typeof labels, BadgeTone> = {
  pendingIntegration: "info",
  pendingRelease: "accent",
  releaseMerged: "success",
  unknown: "warning",
};
export function DeliveryBadge({ id }: { id: string }) {
  const { data } = useWorkspace();
  const stage = data?.deliveryByChange?.[id]?.stage;
  return stage ? <Badge tone={tones[stage]}>{labels[stage]}</Badge> : null;
}
function PrItem({ pr }: { pr: PullRequest }) {
  return (
    <li className={materialClass("delivery-pr")}>
      <a href={pr.url} target="_blank" rel="noopener noreferrer">
        #{pr.number} {pr.title}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <div className={materialClass("delivery-pr-meta")}>
        <Badge
          tone={
            pr.state === "merged"
              ? "success"
              : pr.state === "closed"
                ? "neutral"
                : "info"
          }
        >
          {pr.state === "merged"
            ? "PR 已合入"
            : pr.state === "closed"
              ? "PR 已关闭"
              : pr.draft
                ? "Draft PR"
                : "PR 待合入"}
        </Badge>
        {pr.version && <span>版本 {pr.version}</span>}
        <span>
          {pr.head.branch} → {pr.base.branch}
        </span>
      </div>
    </li>
  );
}
function PrList({
  title,
  prs,
  stale,
}: {
  title: string;
  prs: PullRequest[];
  stale: boolean;
}) {
  const open = prs.filter((p) => p.state === "open");
  const current = open.length ? open : prs.slice(0, 1);
  const history = prs.filter((p) => !current.includes(p));
  return (
    <div className={materialClass("delivery-pr-group")}>
      <h4>{title}</h4>
      {stale && !!prs.length && (
        <p className={materialClass("subtle-note")}>
          以下为上次读取结果，当前状态待核实。
        </p>
      )}
      {current.length ? (
        <ul>
          {current.map((pr) => (
            <PrItem key={pr.number} pr={pr} />
          ))}
        </ul>
      ) : (
        <p className={materialClass("muted")}>
          {stale ? "PR 信息待核实" : "暂无关联 PR"}
        </p>
      )}
      {!!history.length && (
        <details>
          <summary>历史 PR（{history.length}）</summary>
          <ul>
            {history.map((pr) => (
              <PrItem key={pr.number} pr={pr} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
export function ChangeDelivery({ id }: { id: string }) {
  const { data, sharing } = useWorkspace();
  const delivery: Delivery | undefined = data?.deliveryByChange?.[id];
  if (!delivery) return null;
  return (
    <section className={materialClass("change-delivery")} aria-label="交付进度">
      <div className={materialClass("delivery-heading")}>
        <h2 id="delivery">交付进度</h2>
        <DeliveryBadge id={id} />
      </div>
      <PrList
        title="Change PR"
        prs={delivery.changePrs}
        stale={delivery.changePrsStale ?? delivery.stale}
      />
      <PrList
        title="发布 PR"
        prs={delivery.releasePrs}
        stale={delivery.releasePrsStale ?? delivery.stale}
      />
      {!!delivery.diagnostics.length && (
        <ul className={materialClass("delivery-diagnostics")}>
          {delivery.diagnostics.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {delivery.stale && (
        <p className={materialClass("subtle-note")}>
          PR 信息待更新
          {data?.deliveryLastSuccess
            ? `；最近成功读取：${new Date(data.deliveryLastSuccess).toLocaleString()}`
            : sharing
              ? ""
              : "，尚无成功读取记录"}
          。
        </p>
      )}
    </section>
  );
}
