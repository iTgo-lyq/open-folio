# 实施与验证

## T1 修复窄屏顶栏覆盖并验证阅读入口交互

基线为最新 develop `301f364` 的产品实现，在完成文档规划与分支登记后，以 `b239a60`（产品代码未变）运行：

```bash
npm run test:e2e -- tests/browser/specs.spec.ts --grep 'reading settings persist' --reporter=line
```

结果 1 failed：较大字号与专注阅读后，320px 下点击能力目录按钮直到 30 秒超时；trace 记录「本页目录」按钮拦截点击。日志 `/tmp/openfolio-narrow-toolbar-baseline.log`，原始失败 trace 另存 `/tmp/openfolio-narrow-toolbar-baseline-results/`。

工作区复用已完成交付且干净的当前 checkout，分支已独立切换为 `codex/narrow-reader-toolbar`，主工作区继续保持 develop。此前 `.env`／`.env.local` 在主工作区存在；本次 fixture 使用独立模拟账号、端口 10682/10684 与 `.next-e2e`，无需复用真实服务配置。原生 Playwright 套件需要隔离账号与权限，沿用其独立 context，不操作共享 Chrome 默认 Cookie；不运行模型测试。

实际尺寸：320px 左工具区宽 83.42px，仓库入口 62px，位置按钮起点 x=93.11、宽 20px，而右区本页目录按钮从 x=101.42 开始，覆盖位置按钮中心。位置按钮中的固定图标、间距和 padding 溢出了已缩小的父区。临时诊断脚本在获取几何与命中结果后已删除，尺寸日志 `/tmp/openfolio-narrow-toolbar-geometry.log`，修复前截图 `/tmp/openfolio-narrow-toolbar-before.png`。

修复只涉及两个 CSS module 的现有 360px 断点：仓库入口只保留字标与收紧的 padding，位置按钮收起装饰图标，压缩路径和按钮间距。保留标题、下拉提示和完整可访问名称，所有必要入口与原操作行为保留，不修改 JS、设置存储或更宽屏样式。

原失败测试在修复后通过（11.5 秒）。新增四个长标题回归，覆盖标准/较大字号 × 专注开/关，每种均在 390、360、320px 检查所有顶栏按钮中心命中并真实打开能力目录、本页目录和阅读设置，复查 Escape 焦点与横向溢出；原测试另覆盖 1440/834px 与字号持久化。

- `npm run test:e2e -- tests/browser/specs.spec.ts --reporter=line`：9 passed（46.6 秒）。日志 `/tmp/openfolio-narrow-toolbar-specs.log`，截图与结果保存在 `/tmp/openfolio-narrow-toolbar-specs-results/`；修复后的原始 320px 阅读截图 `/tmp/of-refactor-specs-320.png`。
- `npm run typecheck`：应用与 UI 包通过，日志 `/tmp/openfolio-narrow-toolbar-typecheck.log`。
- `npm run build`：任务 worktree 的 `.next` 生产构建通过，日志 `/tmp/openfolio-narrow-toolbar-build.log`；未覆盖主工作区长期服务的产物或数据。
- 两个 CSS module 及 Specs 浏览器测试 Prettier 检查、`git diff --check` 通过。

最终回归证据：

- `npm run test:e2e -- tests/browser/acceptance-feedback.spec.ts tests/browser/workspace.spec.ts tests/browser/change-reader.spec.ts tests/browser/change-sharing.spec.ts --reporter=line`：22 passed（2.0 分钟），覆盖共享顶栏、桌面/手机导航、Change 材料和匿名分享。日志 `/tmp/openfolio-narrow-toolbar-related.log`。
- 补充等待弹层真正关闭及其焦点恢复断言后，重新执行完整 `specs.spec.ts`：9 passed（47.9 秒）。日志 `/tmp/openfolio-narrow-toolbar-specs-final.log`，最终截图在 `/tmp/openfolio-narrow-toolbar-final-results/`。复查 320px 较大字号/专注模式长标题截图，位置入口与右侧按钮分离，时间、刷新和账号入口仍完整显示。
- 最终 `npm run typecheck` 再次通过，日志 `/tmp/openfolio-narrow-toolbar-typecheck-final.log`。本轮只补充测试断言，产品 CSS 与已通过构建的内容一致。

相关 E2E 共 31 项全部通过。本次按用户要求执行相关套件，没有重跑完整 E2E，也不宣称全量结果。两个 CSS module 仅新增 360px 断点样式，原业务逻辑、设置存储和更宽屏规则不变。

small 自查与自验收逐项核对：原失败已复现并恢复；三个手机宽度、四种阅读偏好和长标题的点击/焦点检查通过；1440/834px、分享与 Change 阅读回归通过；没有强制点击、跳过或延长超时。既有 Spec 已要求目录入口可用和长标题省略，本次恢复该行为，无需更新 Specs。PR 目标为 develop，本次交付未合并，不切换长期服务到未集成实现。
