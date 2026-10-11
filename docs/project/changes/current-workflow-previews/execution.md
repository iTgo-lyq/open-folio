# 验证记录

## T1

Change 预览从当前 main 读取原型配置；项目固定版本链接及旧索引快照将配置提交与产物提交分开读取。旧 workflow 不再参与历史预览校验，历史记录与产物继续使用现行字段校验和固定版本。失败描述增加显式标记，页面显示“原型读取失败”，保留具体原因；无关联原型仍使用空态。

- `node --conditions=react-server --test tests/previews.test.ts tests/prototypes.test.ts tests/prototype-migration.test.ts tests/prototype-hosting.test.ts tests/thumbnails.test.ts`：23 项通过。覆盖历史 decision、损坏/缺失/停用配置、归档标签与冷缓存、旧快照、当前配置错误、包路径变化、旧引用拒绝、托管和截图。
- `npx playwright test tests/browser/previews.spec.ts tests/browser/prototypes.spec.ts`：13 项通过。新增真实无效版本测试，确认显示失败标题与原因，无空态掩盖或替代 iframe。
- `npm run build`、`npm run typecheck`、修改文件 Prettier 检查与 `git diff --check` 通过。浏览器验证使用 .next-e2e，结束后执行默认 `next typegen` 恢复 .next 类型引用；生产构建使用当前工作区 .next，未覆盖原运行实例的构建。
- 原 Merlin 转发地址保持不变，tmux 的 openfolio-preview 改为运行当前工作区生产构建。读取真实项目归档标签 ec6f3b24f5659a9609eebeb8a675ad1b9f3c0b72，三个历史入口均返回 200，响应 HTML 与归档 Git 文件逐字节一致；配置来源为 main aaf95c24d2cab78743dbeee77b65e74027e42bcf。当前清单仍仅 workspace-shell。
- 生产浏览器确认旧 Change 的“Change 概览” iframe 可见且有内容；无效 revision 显示“原型读取失败”，没有替代 iframe。

Agent 自查整个差异：原型配置按当前 main 读取，产物固定语义、标签校验、权限与沙箱保留；无旧字段兼容、旧配置回退、历史修改或未解决验收项。
