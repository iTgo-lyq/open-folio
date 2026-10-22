# 执行记录

## 前置与环境（2026-10-22）

- 前置 `change-sharing` 已满足：归档 `docs/project/archive/2026-10-21-change-sharing/`（`dcc98f9`），合入提交 `3dcd334` 是工作分支的祖先（`git merge-base --is-ancestor 3dcd334 HEAD` 通过）。
- 移交提交 `32b464d`：工作分支 `change/frontend-style-interaction-refactor`，worktree `/home/tiger/workspace/open-folio-worktrees/frontend-style-interaction-refactor`。`.env`、`.env.local` 从主工作区复制（Git 忽略、权限 600），`npm ci` 安装依赖。

## T1 · 主题、设计 token 与品牌标志

范围：
- `packages/ui/src/styles.css` 新增浅色 / 深色两套 token（`--of-bg-*`、`--of-fill-*`、`--of-border*`、`--of-text*`、`--of-accent*`、`--of-success/warning/danger*`、`--of-glass*`、`--of-bar-glass`、`--of-blur`、`--of-shadow-*`、`--of-radius-*`、`--of-font-ui/mono`、`--of-ease`），取值来自验收原型；手机深色为纯黑底。旧 `--of-ink` / `--of-blue` 等未改，T12 删除。`--of-color-scheme` 供已迁移容器声明原生控件配色，未迁移页面不出现深色控件。减少动态效果的全局规则放在同一文件。
- 主题：`src/lib/theme.ts` 的内联脚本在 `<head>` 首帧前写入 `<html data-theme>`（本机选择优先，否则跟随系统并随系统变化，跨标签页同步）；`src/components/theme.ts` 的 `useTheme()` 以 `useSyncExternalStore` 读取与切换，服务端快照为浅色。根布局加 `suppressHydrationWarning`。切换入口在 T4 账号菜单、T10/T11 匿名页头接入。
- 品牌：`@open-folio/ui` 新增 `BrandMark`（墨色平面矢量，可选朗读名称），替换壳层、登录页、公开原型页三处 PNG；对应旧 CSS 选择器改为 `svg`。`src/app/icon.svg`（来自 `openfolio-icon.svg`）、180px 不透明 `apple-icon.png` 与 16/32/48 `favicon.ico` 由同一图形生成，删除 `icon.png`。`public/brand/` 文件暂留，T12 确认无引用后处理。
- 与计划的差异：正文 prose 样式改随 T7 交付（已同步 Plan）。

验证：
- `npm run typecheck`、`npm run format:check`、`npm run ui:build`、`npm run ui:test` 通过；`npm run build` 成功。
- 新增 `tests/browser/theme.spec.ts`（3 项）：阻断应用脚本后首帧主题仍跟随系统 / 本机选择；未选择时 `/`、`/share`、`/preview/<id>` 随系统实时切换；矢量标志可朗读、无位图标志，`icon.svg` / `apple-icon.png` 链接存在，`/favicon.ico` 为 `image/x-icon`。与 `workspace`、`personal`、`sharing` 用例共 13 项通过。

## T2 · 共享基础组件

范围：
- `@open-folio/ui` 新增 Menu（普通 / 单选 / 多选、标签、分隔，玻璃浮层）、Popover、Dialog 与 Sheet（右 / 左 / 底部；外层与标题区为玻璃，`SheetBody` 为实底卡片；≤760px 左右抽屉改为底部抽屉）、Tooltip（悬停与键盘聚焦显示）、SegmentedControl（radio 语义）、Switch、Avatar（按名称稳定取色，圆形头像与方形字标）、Skeleton，均基于 `radix-ui` 原语，结构参照 `npx shadcn@latest view`（radix-nova）后改为 `of-ui-` 普通 CSS。
- Button 增加 `ghost` / `danger` 与 `size`，旧 `text` 映射为 `ghost`；IconButton 可选 `tooltip`；Badge、EmptyState、Card、Tabs、Field / Input / Textarea 按新 token 重做视觉，接口不变。浮层与抽屉声明 `color-scheme: var(--of-color-scheme)`。
- 组件预览新增菜单、弹层、对话框与抽屉、分段与开关、头像与占位五组示例和“外观”切换；`tests/ui-preview.mjs` 补充对应键盘、焦点回到触发控件、玻璃材质、深色与 320px 断言。

验证：
- `npm run typecheck`、`npm run format:check`、`npm run ui:build`、`npm run ui:test` 通过。
- 测试注意：Radix 分段控件在下一轮事件中移动焦点，并以“方向键仍按下”决定是否同时选中，自动化需 `keyboard.down` 后稍候再 `up`；切换主题后控件有 0.12s 颜色过渡，截图前需等待。
- 完整浏览器测试：`develop` 现状下 `npx playwright test` 因 `tests/browser/hosting.spec.ts` 经 `tests/fixture.ts` 导入 `server-only` 模块而整体加载失败（与本 Change 无关）；以 `NODE_OPTIONS=--conditions=react-server npx playwright test` 运行时可加载。本次按用户要求优先推进代码，运行到第 58 / 100 项（无失败）后中止，完整套件留到 T12。
