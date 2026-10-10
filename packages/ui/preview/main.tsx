import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  IconButton,
  Badge,
  EmptyState,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabbedCard,
  Input,
  Textarea,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  type BadgeTone,
} from "@open-folio/ui";
import "@open-folio/ui/styles.css";
import "./preview.css";

const sections = [
  {
    id: "fields",
    title: "表单字段",
    code: "Field · Input · Textarea",
    description: "带有标签、说明和校验状态的输入控件。",
  },
  {
    id: "button",
    title: "按钮",
    code: "Button",
    description: "主要操作、次要操作与异步反馈。",
  },
  {
    id: "icon-button",
    title: "图标操作",
    code: "IconButton",
    description: "紧凑的操作入口，保留明确名称与键盘焦点。",
  },
  {
    id: "badge",
    title: "状态标签",
    code: "Badge",
    description: "用颜色与文字表达状态，业务含义由调用方决定。",
  },
  {
    id: "empty",
    title: "空状态",
    code: "EmptyState",
    description: "说明当前位置，给出下一步可以做的事。",
  },
  {
    id: "card",
    title: "内容卡片",
    code: "Card",
    description: "组合标题、内容和操作，组织一组相关信息。",
  },
  {
    id: "tabs",
    title: "选项卡",
    code: "Tabs · TabbedCard",
    description: "在同一位置切换内容，支持方向键和焦点导航。",
  },
];
const tones: BadgeTone[] = [
  "neutral",
  "info",
  "accent",
  "success",
  "warning",
  "danger",
];
function Example({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: ReactNode;
}) {
  return (
    <TabbedCard
      label={`${title}示例视图`}
      items={[
        {
          value: "preview",
          label: "预览",
          content: <div className="example-stage">{children}</div>,
        },
        {
          value: "code",
          label: "代码",
          content: (
            <pre>
              <code>{code}</code>
            </pre>
          ),
        },
      ]}
    />
  );
}
function App() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [count, setCount] = useState(0),
    [tone, setTone] = useState<BadgeTone>("success"),
    [empty, setEmpty] = useState(true);
  const visible = sections.filter((section) =>
    `${section.title} ${section.code} ${section.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const save = () => {
    setBusy(true);
    setSaved(false);
    window.setTimeout(() => {
      setBusy(false);
      setSaved(true);
    }, 600);
  };
  const examples: Record<string, ReactNode> = {
    fields: (
      <Example
        title="表单字段"
        code={
          '<FieldGroup>\n  <Field>\n    <FieldLabel htmlFor="name">项目名称</FieldLabel>\n    <Input id="name" />\n    <FieldDescription>显示在项目列表中。</FieldDescription>\n  </Field>\n</FieldGroup>'
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sample-name">项目名称</FieldLabel>
            <Input
              id="sample-name"
              placeholder="例如：工程协作"
              aria-describedby="sample-name-help"
            />
            <FieldDescription id="sample-name-help">
              显示在项目列表中。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="sample-description">项目说明</FieldLabel>
            <Textarea id="sample-description" placeholder="描述这个项目" />
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="sample-invalid">无效输入</FieldLabel>
            <Input
              id="sample-invalid"
              aria-invalid="true"
              aria-describedby="sample-invalid-help"
              defaultValue="invalid"
            />
            <FieldDescription id="sample-invalid-help">
              请填写有效的地址。
            </FieldDescription>
          </Field>
          <Field data-disabled="true">
            <FieldLabel htmlFor="sample-disabled">不可编辑字段</FieldLabel>
            <Input id="sample-disabled" value="只读示例" disabled />
          </Field>
        </FieldGroup>
      </Example>
    ),
    button: (
      <Example
        title="按钮"
        code={
          '<Button variant="primary" loading={saving} onClick={save}>\n  保存更改\n</Button>'
        }
      >
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
      </Example>
    ),
    "icon-button": (
      <Example
        title="图标操作"
        code={
          '<IconButton aria-label="增加计数" onClick={increment}>\n  <PlusIcon />\n</IconButton>'
        }
      >
        <div className="demo-row">
          <IconButton
            aria-label="增加计数"
            onClick={() => setCount((c) => c + 1)}
          >
            <svg
              aria-hidden="true"
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
      </Example>
    ),
    badge: (
      <Example title="状态标签" code={'<Badge tone="success">已完成</Badge>'}>
        <div className="demo-row">
          {tones.map((t, i) => (
            <Badge key={t} tone={t}>
              {["未开始", "进行中", "计划中", "已完成", "待处理", "已取消"][i]}
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
              {tones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <Badge tone={tone}>当前选择 · {tone}</Badge>
        </div>
      </Example>
    ),
    empty: (
      <Example
        title="空状态"
        code={
          '<EmptyState\n  title="还没有预览页面"\n  action={<Button onClick={load}>显示示例内容</Button>}\n>页面准备好后，可以在这里直接查看。</EmptyState>'
        }
      >
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
      </Example>
    ),
    card: (
      <Example
        title="内容卡片"
        code={
          "<Card>\n  <CardHeader>\n    <CardTitle>项目页面</CardTitle>\n    <CardDescription>每个入口，都值得被看见。</CardDescription>\n  </CardHeader>\n  <CardContent>页面内容</CardContent>\n  <CardFooter>相关操作</CardFooter>\n</Card>"
        }
      >
        <Card className="sample-card">
          <CardHeader>
            <CardTitle>项目页面</CardTitle>
            <CardDescription>每个入口，都值得被看见。</CardDescription>
            <CardAction>
              <Badge tone="success">已就绪</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="mini-page" aria-hidden="true">
              <div className="mini-rail" />
              <div className="mini-body">
                <i />
                <i />
                <div>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <span className="sample-note">从清晰的信息组织开始</span>
            <Button
              onClick={() => document.getElementById("tabs")?.scrollIntoView()}
            >
              查看组合示例 →
            </Button>
          </CardFooter>
        </Card>
      </Example>
    ),
    tabs: (
      <Example
        title="选项卡"
        code={
          '<TabbedCard label="项目介绍" items={[\n  { value: "overview", label: "概览", content: <Overview /> },\n  { value: "details", label: "详情", content: <Details /> },\n]} />'
        }
      >
        <Tabs defaultValue="overview" className="sample-tabs">
          <TabsList aria-label="项目示例">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="details">详情</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              即将推出
            </TabsTrigger>
          </TabsList>
          <div className="tab-surface">
            <TabsContent value="overview">
              <h3>从组件到页面</h3>
              <p>组合基础组件，保持一致的颜色、间距与交互。</p>
              <Badge tone="info">共享实现</Badge>
            </TabsContent>
            <TabsContent value="details">
              <h3>为真实使用而准备</h3>
              <p>方向键切换选项，Tab 进入内容；预览与主应用使用相同的组件。</p>
              <Badge tone="success">键盘可操作</Badge>
            </TabsContent>
          </div>
        </Tabs>
        <p className="source-note">本页的预览 / 代码容器使用 TabbedCard。</p>
      </Example>
    ),
  };
  return (
    <div className="catalog">
      <aside className="sidebar">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>
            OpenFolio <small>UI</small>
          </span>
        </a>
        <p className="nav-label">
          组件目录 <span>06</span>
        </p>
        <nav aria-label="组件导航">
          {sections.map(({ id, title, code }, index) => (
            <a key={id} href={`#${id}`} onClick={() => setQuery("")}>
              <span className="nav-index">0{index + 1}</span>
              <span>
                {title}
                <code>{code}</code>
              </span>
              <span className="nav-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </nav>
        <div className="aside-note">
          <Badge tone="success">React 19</Badge>
          <p>
            组件与主应用共享实现。
            <br />
            在这里查看、操作和比较状态。
          </p>
        </div>
      </aside>
      <main id="top">
        <div className="topline">
          <span>设计与开发 / 组件参考</span>
          <Badge>v0.1</Badge>
        </div>
        <header className="hero">
          <p className="eyebrow">OPENFOLIO DESIGN SYSTEM</p>
          <h1>
            小组件。
            <br />
            <span>清晰的界面。</span>
          </h1>
          <p className="intro">
            从一个按钮到一组页面，
            <br />
            在同一套语言里，找到合适的表达。
          </p>
          <div className="hero-bottom">
            <a className="browse-link" href="#component-list">
              浏览组件 <span aria-hidden="true">↓</span>
            </a>
            <span>7 个公共组件 · 6 组交互示例</span>
          </div>
          <div className="token-sheet">
            <p>
              FOUNDATIONS <span>01</span>
            </p>
            <div className="swatch-strip" aria-label="主题颜色">
              {["ink", "blue", "green", "orange", "muted"].map((name) => (
                <span
                  key={name}
                  title={name}
                  style={{ background: `var(--of-${name})` }}
                />
              ))}
            </div>
            <div className="type-sample">
              Aa{" "}
              <span>
                字形、留白与层次
                <br />
                <strong>让内容成为中心</strong>
              </span>
            </div>
            <div className="token-footer">
              <span>统一主题</span>
              <span>一致交互</span>
              <span>可组合</span>
            </div>
          </div>
        </header>
        <div className="list-toolbar" id="component-list">
          <div>
            <p className="eyebrow">THE COMPONENTS</p>
            <h2>找到需要的组件</h2>
          </div>
          <label className="search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              aria-label="搜索组件"
              placeholder="搜索名称或用途…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <p className="search-count" role="status">
          {query
            ? `找到 ${visible.length} 组示例`
            : "点击操作体验状态，切换代码查看用法。"}
        </p>
        {visible.map((section) => (
          <section
            className="component-section"
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
          >
            <div className="section-heading">
              <div>
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <p>{section.description}</p>
              </div>
              <code>{section.code}</code>
            </div>
            {examples[section.id]}
          </section>
        ))}
        {!visible.length && (
          <EmptyState
            title="没有找到组件"
            action={<Button onClick={() => setQuery("")}>清除搜索</Button>}
          >
            <p>试试中文名称、组件名或用途。</p>
          </EmptyState>
        )}
        <footer>
          <span>OpenFolio UI</span>
          <span>基础组件，持续维护</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
