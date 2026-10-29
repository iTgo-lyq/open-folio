# T1：统一合入阅读视觉

按 Requirement 方案要点完成实现：合入信息收为一行，“只读”悬停说明替代列表底部说明；文件数与增删统计移入列表表头；列表条目改为界面字体、名称与增删同行、目录从开头省略，“修改”不再标注，选中态使用中性选中底与加粗；文件头与工具合为一行，工具改为带提示的图标按钮；卡片统一白底，行号栏收窄并以细线分隔，增删行号叠加同色 soft token，hunk 改为弱化细条；卡片高度改为 `clamp(360px, calc(100dvh - 228px), 1200px)`。未改色板 token 或服务端契约，测试依赖的按钮、区域名称与“已合入 develop”文本保持不变。

## 验证证据

- `npx tsc --noEmit`、改动文件 Prettier 检查及 `git diff --check` 通过。
- 按用户安排，本会话只完成样式实现，未启动浏览器、未运行浏览器回归或截图；任务保持 doing，验收与归档由后续 Agent 完成。

## 交接

- 修改前截图（真实增删差异，桌面浅/深色、1920、iPad、手机列表与差异）保存在主工作区 `artifacts/integration-diff-visual-polish/before-*.png`。同目录的 `shots.config.ts`、`shots.spec.ts` 以 `diff.json`（由 `make-diff.mjs` 从提交 7238e8c 生成）拦截文件与差异接口；启动 e2e 服务后运行 `SHOT_LABEL=after node --conditions=react-server node_modules/@playwright/test/cli.js test --config artifacts/integration-diff-visual-polish/shots.config.ts` 可得对比截图。
- 待核对：两栏表头 52px 最小高度是否对齐；目录 RTL 省略在长路径与根目录文件下的显示；卡片高度在 1000px 桌面与 844px 手机下的底部留白及底部导航遮挡；深色下 hunk 细条与增删行号对比度。
- 之后运行 `tests/browser/integration.spec.ts`、`refactor-layout.spec.ts`、类型检查与生产构建，依 Requirement 由用户凭前后截图人工验收，再完成关闭步骤、合入 PR #26 并更新 11117 服务。
