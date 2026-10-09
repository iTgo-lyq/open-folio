# T1 基础 UI 包与前端约定

抽取 Button、IconButton、Badge、EmptyState 及公共 token，主应用的状态标签、空态和文档操作直接消费包入口。前端规范直接写入 AGENTS.md，未新增独立前端规范文档。安装、类型检查、格式检查和 Next 生产构建通过；Changes 与 Specs 浏览器回归 17 项通过，包含文档弹层焦点恢复及 320px 布局。

验证命令：`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm run format:check`、`npm run build`、`npx playwright test tests/browser/changes.spec.ts tests/browser/specs.spec.ts`。
