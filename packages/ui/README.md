# @open-folio/ui

OpenFolio 的基础 React 组件；开发约定直接维护在根 [AGENTS.md](../../AGENTS.md)。

```tsx
import { Button, IconButton, Badge, EmptyState } from "@open-folio/ui";
import "@open-folio/ui/styles.css";

<Button variant="primary" loading={saving} onClick={save}>保存</Button>
<IconButton aria-label="关闭" onClick={close}>×</IconButton>
<Badge tone="success">已完成</Badge>
<EmptyState title="还没有内容" action={<Button>刷新</Button>}>选择项目后查看。</EmptyState>
```

Button 支持 default/primary/text、loading 和原生 button 属性；IconButton 必须提供 aria-label。Badge 的 tone 为 neutral/info/accent/success/warning/danger，业务状态到颜色的映射由应用负责。EmptyState 接收 title、icon、action 和 children。

包直接导出 TypeScript 源码，由消费方编译。React 使用 peer dependency；公共样式只在消费方入口导入一次，可覆盖 `--of-*` token。`npm run typecheck --workspace @open-folio/ui` 检查包类型。

表单使用 `FieldGroup`、`Field`、`FieldLabel`、`FieldDescription` 组合 `Input` 或 `Textarea`。控件保留原生属性，标签通过 `htmlFor` 关联 `id`，说明通过 `aria-describedby` 关联；校验状态同时使用 Field 的 `data-invalid` 和控件的 `aria-invalid`。字段值与校验逻辑由调用方维护。

## 独立预览

根目录运行 `npm run ui:dev`，在 http://127.0.0.1:10683 查看组件导航和交互。`npm run ui:build` 生成包内 dist，`npm run ui:preview` 查看生产结果，`npm run ui:test` 验证生产预览的交互与窄屏布局；无需配置或启动 OpenFolio 服务，dist 不入 Git。

日常修改共享实现后更新相应示例，运行 `npm run typecheck`、`npm run format:check`、`npm run build` 与 `npm run ui:build`，再查看主应用和预览的适用状态。示例只提供参数、局部状态与 mock；公共入口不导出示例。

## Card、Tabs 与组合示例

新增 Card/Header/Title/Description/Action/Content/Footer、Tabs/List/Trigger/Content，以及 TabbedCard；均从包入口导入。Tabs 保留 Radix 的受控 value、defaultValue、onValueChange、orientation 和键盘操作；TabsList 支持 default/line。TabbedCard 接收带唯一 value 的 items（label、content、可选 disabled）和必填的选项组 label，也支持受控 value。

```tsx
<TabbedCard
  label="示例视图"
  items={[
    { value: "preview", label: "预览", content: <Example /> },
    { value: "code", label: "代码", content: <pre>用法</pre> },
  ]}
/>
```

新增组件先运行 `npx shadcn@latest info -c packages/ui --json`，再通过 CLI dry-run/view 检查来源与差异；生成代码须适配本包 token、公共接口和相对导入，不直接覆盖已有实现。包有意使用普通 CSS，组件安装后的 Tailwind 类需要转换后才可供两个消费方共用。
