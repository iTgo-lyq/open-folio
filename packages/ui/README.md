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
