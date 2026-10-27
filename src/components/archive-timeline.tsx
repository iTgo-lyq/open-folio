"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { GitMerge, GitPullRequest, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@open-folio/ui";
import { archiveTimeline, type ArchiveBatch } from "@/lib/archive-timeline";
import type { ChangeGroup, Delivery } from "@/lib/model";
import styles from "./archive-timeline.module.css";

function Batch({
  batch,
  render,
  returnTo,
  expansion,
  expansionKey,
  showCount,
}: {
  batch: ArchiveBatch;
  render: (change: ChangeGroup) => ReactNode;
  returnTo?: string | null;
  expansion: Set<string>;
  expansionKey: string;
  showCount: boolean;
}) {
  const [expanded, setExpanded] = useState(
    () =>
      expansion.has(expansionKey) ||
      batch.items.some((change, index) => index >= 3 && change.id === returnTo),
  );
  useEffect(() => {
    if (expanded) expansion.add(expansionKey);
    else expansion.delete(expansionKey);
  }, [expanded, expansion, expansionKey]);
  const id = useId();
  const { pr, items } = batch;
  return (
    <section
      className={styles.batch}
      aria-label={pr ? `合入 PR #${pr.number}` : "时间未知的合入"}
    >
      {pr && (
        <header className={styles.batchHeading}>
          <GitMerge aria-hidden="true" />
          {pr.version && <h3>{pr.version}</h3>}
          <code title="合入分支">{pr.base.branch}</code>
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`合入 PR #${pr.number}`}
          >
            <GitPullRequest aria-hidden="true" />#{pr.number}
          </a>
          <time
            dateTime={pr.mergedAt!}
            title={new Date(pr.mergedAt!).toLocaleString("zh-CN")}
          >
            {new Date(pr.mergedAt!).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </time>
          {showCount && <span>{items.length} 个 Change</span>}
        </header>
      )}
      <ul id={id} className={styles.items}>
        {(expanded ? items : items.slice(0, 3)).map((change) => (
          <li key={change.id}>{render(change)}</li>
        ))}
      </ul>
      {items.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.expand}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? "收起" : `展开其余 ${items.length - 3} 项`}
        </Button>
      )}
    </section>
  );
}

export function ArchiveTimeline({
  changes,
  delivery,
  render,
  returnTo,
  projectId,
  expansion,
}: {
  changes: ChangeGroup[];
  delivery?: Record<string, Delivery>;
  render: (change: ChangeGroup) => ReactNode;
  returnTo?: string | null;
  projectId: string;
  expansion: Set<string>;
}) {
  const days = archiveTimeline(changes, delivery);
  return (
    <div className={styles.timeline} role="region" aria-label="Change 列表">
      {days.map((day) => (
        <section className={styles.day} key={day.key} aria-label={day.label}>
          <header className={styles.date}>
            <h2>
              {day.key === "unknown" ? (
                day.label
              ) : (
                <time dateTime={day.key}>{day.label}</time>
              )}
            </h2>
            <span>{day.count} 个 Change</span>
          </header>
          <div className={styles.batches}>
            {day.batches.map((batch) => (
              <Batch
                key={batch.key}
                batch={batch}
                showCount={day.batches.length > 1}
                render={render}
                returnTo={returnTo}
                expansion={expansion}
                expansionKey={`${projectId}:${batch.key}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
