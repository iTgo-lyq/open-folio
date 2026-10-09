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

## 独立预览

根目录运行 `npm run ui:dev`，在 http://127.0.0.1:10683 查看组件导航和交互。`npm run ui:build` 生成包内 dist，`npm run ui:preview` 查看生产结果，`npm run ui:test` 验证生产预览的交互与窄屏布局；无需配置或启动 OpenFolio 服务，dist 不入 Git。

日常修改共享实现后更新相应示例，运行 `npm run typecheck`、`npm run format:check`、`npm run build` 与 `npm run ui:build`，再查看主应用和预览的适用状态。示例只提供参数、局部状态与 mock；公共入口不导出示例。
