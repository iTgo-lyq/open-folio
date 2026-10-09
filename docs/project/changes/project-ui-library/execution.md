# T1 基础 UI 包与前端约定

抽取 Button、IconButton、Badge、EmptyState 及公共 token，主应用的状态标签、空态和文档操作直接消费包入口。前端规范直接写入 AGENTS.md，未新增独立前端规范文档。安装、类型检查、格式检查和 Next 生产构建通过；Changes 与 Specs 浏览器回归 17 项通过，包含文档弹层焦点恢复及 320px 布局。

验证命令：`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm run format:check`、`npm run build`、`npx playwright test tests/browser/changes.spec.ts tests/browser/specs.spec.ts`。

# T6 修复 T1 样式抽取范围

提交后的差异复查发现抽取正则匹配了移动端同名规则，误删无关布局。恢复原样式，仅移除包已接管的基础 Empty/Badge 规则，将其余上下文选择器改为公共组件类名；对原基线差异收敛为 22 行新增、110 行移除。重新通过 Next 生产构建及 17 项 Changes/Specs 浏览器回归，并查看桌面看板与移动详情截图，确认导航、列布局、抽屉和焦点显示正常。
