import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  IconButton,
  Badge,
  EmptyState,
  type BadgeTone,
} from "@open-folio/ui";
import "@open-folio/ui/styles.css";
import "./preview.css";
const sections = [
  ["button", "按钮", "Button"],
  ["icon-button", "图标操作", "IconButton"],
  ["badge", "状态标签", "Badge"],
  ["empty", "空状态", "EmptyState"],
];
function App() {
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [count, setCount] = useState(0),
    [tone, setTone] = useState<BadgeTone>("success"),
    [empty, setEmpty] = useState(true);
  const save = () => {
    setBusy(true);
    setSaved(false);
    window.setTimeout(() => {
      setBusy(false);
      setSaved(true);
    }, 600);
  };
  return (
    <div className="catalog">
      <aside>
        <a className="brand" href="#top">
          <span className="brand-mark">O</span> OpenFolio <small>UI</small>
        </a>
        <p className="nav-label">组件目录</p>
        <nav aria-label="组件导航">
          {sections.map(([id, title, code]) => (
            <a key={id} href={`#${id}`}>
              <span>{title}</span>
              <code>{code}</code>
            </a>
          ))}
        </nav>
        <p className="aside-note">
          组件与主应用共享实现。
          <br />
          在这里查看、操作和比较状态。
        </p>
      </aside>
      <main id="top">
        <header>
          <p className="eyebrow">OpenFolio / Component library</p>
          <h1>界面，从这里开始。</h1>
          <p>一套共享的基础组件，一处可操作的使用参考。</p>
          <div className="tokens" aria-label="主题颜色">
            {["ink", "blue", "muted", "green", "orange"].map((name) => (
              <span key={name}>
                <i style={{ background: `var(--of-${name})` }} />
                {name}
              </span>
            ))}
          </div>
        </header>
        <section id="button">
          <div className="section-heading">
            <h2>
              按钮 <code>Button</code>
            </h2>
            <p>主要操作、次要操作与异步反馈。</p>
          </div>
          <div className="demo-row">
            <Button variant="primary" onClick={save} loading={busy}>
              {busy ? "保存中" : "保存更改"}
            </Button>
            <Button onClick={() => setSaved(false)}>重置反馈</Button>
            <Button variant="text" onClick={() => setCount((c) => c + 1)}>
              次要操作
            </Button>
            <Button disabled>暂不可用</Button>
          </div>
          <p className="feedback" role="status">
            {saved ? "更改已保存" : `次要操作已触发 ${count} 次`}
          </p>
          <pre>
            {
              '<Button variant="primary" loading={saving} onClick={save}>保存更改</Button>'
            }
          </pre>
        </section>
        <section id="icon-button">
          <div className="section-heading">
            <h2>
              图标操作 <code>IconButton</code>
            </h2>
            <p>空间有限时，保留清晰的操作名称和键盘焦点。</p>
          </div>
          <div className="demo-row">
            <IconButton
              aria-label="增加计数"
              onClick={() => setCount((c) => c + 1)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 4v16M4 12h16" />
              </svg>
            </IconButton>
            <IconButton aria-label="不可用的增加操作" disabled>
              +
            </IconButton>
            <span>计数 {count}</span>
          </div>
          <pre>
            {
              '<IconButton aria-label="增加计数" onClick={increment}>…</IconButton>'
            }
          </pre>
        </section>
        <section id="badge">
          <div className="section-heading">
            <h2>
              状态标签 <code>Badge</code>
            </h2>
            <p>只表达展示语义，业务状态由应用映射。</p>
          </div>
          <div className="demo-row">
            {(
              [
                "neutral",
                "info",
                "accent",
                "success",
                "warning",
                "danger",
              ] as BadgeTone[]
            ).map((t, i) => (
              <Badge key={t} tone={t}>
                {
                  ["未开始", "进行中", "计划中", "已完成", "待处理", "已取消"][
                    i
                  ]
                }
              </Badge>
            ))}
          </div>
          <div className="demo-row">
            <label>
              展示语义{" "}
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as BadgeTone)}
              >
                {[
                  "neutral",
                  "info",
                  "accent",
                  "success",
                  "warning",
                  "danger",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <Badge tone={tone}>当前选择 · {tone}</Badge>
          </div>
          <pre>{'<Badge tone="success">已完成</Badge>'}</pre>
        </section>
        <section id="empty">
          <div className="section-heading">
            <h2>
              空状态 <code>EmptyState</code>
            </h2>
            <p>解释当前位置，并给出下一步可以做的事。</p>
          </div>
          <div className="empty-demo">
            {empty ? (
              <EmptyState
                title="还没有预览页面"
                icon={<span>▤</span>}
                action={
                  <Button onClick={() => setEmpty(false)}>显示示例内容</Button>
                }
              >
                <p>页面准备好后，可以在这里直接查看。</p>
              </EmptyState>
            ) : (
              <div className="populated">
                <Badge tone="success">示例已载入</Badge>
                <h3>项目页面</h3>
                <p>内容由预览侧的内存状态提供。</p>
                <Button onClick={() => setEmpty(true)}>恢复空状态</Button>
              </div>
            )}
          </div>
          <pre>
            {
              '<EmptyState title="还没有预览页面" action={<Button>显示内容</Button>}>…</EmptyState>'
            }
          </pre>
        </section>
        <footer>OpenFolio UI · 基础组件，持续维护</footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
