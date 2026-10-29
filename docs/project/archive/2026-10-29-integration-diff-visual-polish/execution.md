# T1：统一合入阅读视觉

按 Requirement 方案要点完成实现：合入信息收为一行，“只读”悬停说明替代列表底部说明；文件数与增删统计移入列表表头；列表条目改为界面字体、名称与增删同行、目录从开头省略，“修改”不再标注，选中态使用中性选中底与加粗；文件头与工具合为一行，工具改为带提示的图标按钮；卡片统一白底，行号栏收窄并以细线分隔，增删行号叠加同色 soft token，hunk 改为弱化细条；卡片高度改为 `clamp(360px, calc(100dvh - 228px), 1200px)`。未改色板 token 或服务端契约，测试依赖的按钮、区域名称与“已合入 develop”文本保持不变。

## 验证证据

- `npm run typecheck`、`npm run build`、改动文件 Prettier 检查及 `git diff --check` 通过。
- `npm run test:e2e -- tests/browser/integration.spec.ts tests/browser/refactor-layout.spec.ts`：10 项通过，覆盖短文件与非文本等高、长行换行、独立滚动、固定版本与深链接、历史导航、复制兜底、晚到响应隔离，以及多宽度双主题布局。浏览器回归沿用框架隔离上下文，兼容测试登录与虚构 Provider。初次启动受旧工作区的跨目录依赖链接影响；改为本地安装后，完整重跑通过。
- 常驻 Chrome CDP 新标签页运行最新分支界面，通过无 Cookie 的匿名请求读取截图对应的真实归档内容。1440px 浅色/深色、390px 文件列表及差异截图已展示给用户；桌面两栏同为 770px 高。检查后仅关闭任务页面、断开连接并停止临时预览。

## 验收与截图

- 主工作区 `artifacts/integration-diff-visual-polish/current-desktop-light.png`、`current-desktop-dark.png`、`current-mobile-light.png` 和 `current-mobile-light-list.png` 为本次真实内容截图；`before-*.png` 保留上一轮对照。
- 目录保留最近层级、浅深色行号与增删底色、视口底部空间及两栏等高已经截图和回归核对。长路径换行时右侧表头比左侧略高，已向用户明确展示，用户接受当前效果。
- 用户验收原话：“没问题，归档吧”；随后明确要求“合入 dev 和 main”。按仓库配置交付到 develop，再通过发布 PR 同步 main；沿用当前统一版本 0.1.15。Agent 自查无未解决验收项。
