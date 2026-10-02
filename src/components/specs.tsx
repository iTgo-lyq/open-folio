"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ListTree,
  Search,
} from "lucide-react";
import type { SpecRef } from "@/lib/model";
import { useWorkspace } from "./context";
import { DocumentContent, Empty } from "./document";
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
  const { data, q, nav, projectId } = useWorkspace(),
    [filter, setFilter] = useState(""),
    [mobileTree, setMobileTree] = useState(false),
    [closed, setClosed] = useState<string[]>([]);
  const specs = data?.specs ?? [],
    selected = q.s ? specs.find((s) => s.id === q.s) : specs[0];
  const storageKey = `openfolio.tree.${projectId}.${data?.selectedBranch}`;
  useEffect(() => {
    try {
      setClosed(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    } catch {
      setClosed([]);
    }
  }, [storageKey]);
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
  const tree = useMemo(
    () =>
      treeOf(
        specs.filter((s) =>
          `${s.title} ${s.id}`
            .toLocaleLowerCase()
            .includes(filter.toLocaleLowerCase()),
        ),
      ),
    [specs, filter],
  );
  function nodes(items: Tree[], depth = 0): React.ReactNode {
    return items.map((n) => (
      <li key={n.path}>
        <div
          className={`tree-row ${selected?.id === n.path ? "selected" : ""}`}
          style={{ paddingLeft: 10 + depth * 15 }}
        >
          {n.children.length ? (
            <button
              className="tree-toggle"
              aria-label={`${closed.includes(n.path) ? "展开" : "收起"} ${n.name}`}
              aria-expanded={!closed.includes(n.path)}
              onClick={() => toggle(n.path)}
            >
              {closed.includes(n.path) ? <ChevronRight /> : <ChevronDown />}
            </button>
          ) : (
            <span className="tree-spacer" />
          )}
          <button
            className="tree-item"
            onClick={() => {
              if (n.spec) {
                nav({ s: n.path, anchor: null });
                setMobileTree(false);
              } else toggle(n.path);
            }}
            aria-current={selected?.id === n.path ? "page" : undefined}
          >
            {n.spec ? <FileText size={14} /> : <Folder size={14} />}
            <span>{n.spec?.title ?? n.name}</span>
          </button>
        </div>
        {n.children.length > 0 && (!closed.includes(n.path) || filter) && (
          <ul>{nodes(n.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }
  return (
    <section className={`spec-workspace ${mobileTree ? "show-tree" : ""}`}>
      <aside className="spec-sidebar">
        <div className="sidebar-heading">
          <span>能力目录</span>
          <span className="count">{specs.length}</span>
          <button
            className="mobile-only icon-button"
            aria-label="关闭目录"
            onClick={() => setMobileTree(false)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <label className="small-search">
          <Search size={14} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选能力…"
            aria-label="筛选能力"
          />
        </label>
        <nav className="capability-tree" aria-label="能力目录">
          <ul>{nodes(tree.children)}</ul>
          {filter && !tree.children.length && (
            <p className="muted inset">没有匹配的能力</p>
          )}
        </nav>
        <footer className="sidebar-footer">
          <span className="status-dot" />
          已推送的能力文档
        </footer>
      </aside>
      <div className="spec-reading">
        <div className="reader-breadcrumb">
          <button
            className="mobile-only icon-button"
            onClick={() => setMobileTree(true)}
            aria-label="打开能力目录"
          >
            <ListTree size={17} />
          </button>
          <span>Specs</span>
          {selected && (
            <>
              <ChevronRight size={13} />
              <span className="truncate">{selected.id}</span>
            </>
          )}
        </div>
        {!data?.selectedBranch ? (
          <Empty title="选择 Specs 来源">
            <p>请选择一个已推送分支，开始阅读能力文档。</p>
          </Empty>
        ) : selected ? (
          <DocumentContent
            key={selected.documentId}
            id={selected.documentId}
            anchor={q.anchor}
          />
        ) : q.s ? (
          <Empty title="此来源中没有这项能力">
            <p>{q.s}</p>
            <button
              className="button"
              onClick={() => nav({ s: null, anchor: null })}
            >
              返回能力目录
            </button>
          </Empty>
        ) : (
          <Empty title="这里还没有已实现的 Specs">
            <p>
              当前分支尚未提交能力文档。
              <br />
              Change 完成人工验收并同步 Specs 后，将在这里呈现。
            </p>
            <button className="button" onClick={() => nav({ m: "changes" })}>
              查看 Changes
            </button>
          </Empty>
        )}
      </div>
    </section>
  );
}
