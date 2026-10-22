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
