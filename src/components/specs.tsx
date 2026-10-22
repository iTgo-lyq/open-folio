"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Avatar, Badge, Button } from "@open-folio/ui";
import type { SpecRef } from "@/lib/model";
import { primaryRecord, STAGE_LABELS } from "@/lib/model";
import { usePersonal } from "./personal-context";
import { useWorkspace, useDocument } from "./context";
import { Empty } from "./document";
import { Reader } from "./reader";
import { ReadingDocument } from "./reading-document";
import styles from "./specs.module.css";

type Tree = { path: string; name: string; spec?: SpecRef; children: Tree[] };
function treeOf(specs: SpecRef[]) {
  const root: Tree = { path: "", name: "", children: [] };
  for (const spec of specs) {
    let parent = root;
    for (const name of spec.id.split("/")) {
      const path = parent.path ? `${parent.path}/${name}` : name;
      let node = parent.children.find((n) => n.path === path);
      if (!node) {
        node = { path, name, children: [] };
        parent.children.push(node);
      }
      parent = node;
    }
    parent.spec = spec;
  }
  const sort = (node: Tree) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}
export default function Specs() {
  const { data, q, nav, projectId, revealVersion } = useWorkspace();
  const personal = usePersonal();
  const [closed, setClosed] = useState<string[]>([]);
  const specs = data?.specs ?? [];
  const selected = q.s ? specs.find((spec) => spec.id === q.s) : specs[0];
  const { value, error, loading } = useDocument(selected?.documentId);
  const storageKey = `openfolio.tree.${personal.connection?.id ?? ""}.${projectId}.${data?.selectedBranch}`;
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      setClosed(
        Array.isArray(value) ? value.filter((p) => typeof p === "string") : [],
      );
    } catch {
      setClosed([]);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!selected?.id) return;
    setClosed((prev) => {
      const next = prev.filter((path) => !selected.id.startsWith(`${path}/`));
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [selected?.id, storageKey, revealVersion]);
  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  const tree = useMemo(() => treeOf(specs), [specs]);
  function nodes(items: Tree[], depth = 0): React.ReactNode {
    return items.map((node) => (
      <li key={node.path}>
        <div
          className={styles.treeRow}
          data-selected={selected?.id === node.path || undefined}
          style={{ paddingLeft: depth * 14 }}
        >
          {node.children.length ? (
            <button
              className={styles.toggle}
              type="button"
              aria-label={`${closed.includes(node.path) ? "展开" : "收起"} ${node.name}`}
              aria-expanded={!closed.includes(node.path)}
              onClick={() => toggle(node.path)}
            >
              {closed.includes(node.path) ? <ChevronRight /> : <ChevronDown />}
            </button>
          ) : (
            <span className={styles.spacer} />
          )}
          {node.spec ? (
            <a
              className={styles.item}
              href={`?${new URLSearchParams({ ...q, m: "specs", s: node.path, anchor: "", raw: "" })}`}
              aria-current={selected?.id === node.path ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                nav({ s: node.path, anchor: null, raw: null });
              }}
            >
              <FileText aria-hidden="true" />
              <span>{node.spec.title}</span>
            </a>
          ) : (
            <button
              type="button"
              className={styles.item}
              onClick={() => toggle(node.path)}
              aria-expanded={!closed.includes(node.path)}
            >
              <Folder aria-hidden="true" />
              <span>{node.name}</span>
            </button>
          )}
        </div>
        {node.children.length > 0 && !closed.includes(node.path) && (
          <ul>{nodes(node.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }
  const related = (data?.changes ?? []).filter(
    (change) =>
      selected && primaryRecord(change)?.relatedSpecs.includes(selected.id),
  );
  const doc = data?.documents.find((doc) => doc.id === selected?.documentId);
  const headings = [
    ...(doc?.headings.filter((h) => h.depth > 1) ?? []),
    ...(related.length
      ? [{ id: "related-changes", text: "相关 Change", depth: 2, line: 0 }]
      : []),
  ];
  const after = !!related.length && (
    <section className={styles.related} aria-labelledby="related-changes">
      <h2 id="related-changes">相关 Change</h2>
      <ul>
        {related.map((change) => {
          const state = primaryRecord(change)?.state,
            creator = change.creator;
          return (
            <li key={change.id}>
              <a
                href={`?${new URLSearchParams({ ...q, m: "changes", c: change.id, ct: "overview" })}`}
                onClick={(event) => {
                  event.preventDefault();
                  nav({
                    m: "changes",
                    c: change.id,
                    ct: "overview",
                    s: null,
                    anchor: null,
                    doc: null,
                    raw: null,
                  });
                }}
              >
                <span>
                  <strong>{change.title}</strong>
                  <small>{change.id}</small>
                </span>
                <Badge>
                  {state?.status === "completed"
                    ? "已完成"
                    : state?.status === "cancelled"
                      ? "已取消"
                      : state
                        ? STAGE_LABELS[state.stage]
                        : "来源异常"}
                </Badge>
                {creator && <Avatar name={creator.login ?? creator.name} />}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
  return (
    <Reader
      paneLabel="能力目录"
      paneTitle="Specs"
      pane={
        <nav aria-label="能力目录">
          <ul className={styles.tree}>{nodes(tree.children)}</ul>
        </nav>
      }
      headings={headings}
      pageKey={`${projectId}.${doc?.branch}.${selected?.documentId ?? "empty"}`}
      anchor={q.anchor}
      onAnchor={(anchor) => nav({ anchor })}
      ready={!!value}
    >
      {!data?.selectedBranch ? (
        <Empty title="选择 Specs 来源">
          <p>请选择一个已推送分支，开始阅读能力文档。</p>
        </Empty>
      ) : selected ? (
        <ReadingDocument
          value={value}
          error={error}
          loading={loading}
          after={after}
        />
      ) : q.s ? (
        <Empty title="此来源中没有这项能力">
          <p>{q.s}</p>
          <Button onClick={() => nav({ s: null, anchor: null })}>
            返回能力目录
          </Button>
        </Empty>
      ) : (
        <Empty title="这里还没有已实现的 Specs">
          <p>第一个 Change 完成并同步 Specs 后，会出现在这里。</p>
          <Button onClick={() => nav({ m: "changes" })}>查看 Changes</Button>
        </Empty>
      )}
    </Reader>
  );
}
