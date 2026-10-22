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

## T3 · Change 创建者读取

范围：
- `GitReader.changeCreations` 取代 `changeCreationTimes`：同一次 `git log --diff-filter=A` 扫描在格式中加入作者名与邮箱，按最早加入时间保留该提交的作者。
- `changeCreator(name, email)` 只从 GitHub 隐私邮箱（`<id>+<login>@` 与 `<login>@users.noreply.github.com`）识别登录名，邮箱本身不进入快照；名称为空时以登录名代替，二者皆无则省略。`ChangeGroup.creator?: { name; login? }`。
- 快照缓存版本 8 → 9（`store.ts`、`Snapshot` 类型、分享页 `sharedWorkbench`）；分享接口 `projectChange` 带上 `creator`。界面暂不使用。

验证：
- 扩展 `tests/change-creation-order.test.ts`：多作者下首次加入者在编辑与归档迁移后保持不变，合并引入取合并提交作者，noreply 登录名识别，快照中不含邮箱，分享投影带上创建者，暖刷新结果一致；`changeCreator` 单测覆盖两种 noreply、普通邮箱、伪造域名与空名称。`store`、`changes`、`shares`、`incremental-cache` 同跑 38 项通过；`npm run typecheck` 通过。
- `npm test` 286 项中 285 项通过；失败的 `service-tools.test.ts`“service lifecycle…”在临时目录执行 `scripts/service.mjs update`（构建并启动服务）时失败，本 Change 未改动服务脚本，按用户要求记录为环境问题，留待 T12 复核。

## T4 · 工作台壳层与导航

接手时工作区保留了 T4 的未提交实现。本轮先构建并阅读验收原型（`quiet-home`、`quiet-credentials`，含桌面与手机画面），再继续核对。合入本地 `develop@5d3ca6a` 的浏览器测试启动修复，保留原有改动；合并提交 `ec994bc` 已推送。

范围：
- 新壳层以 CSS Modules 实现 244px 展开侧栏、72px 图标轨与玻璃胶囊、手机底部导航，Logo 与快捷键控制收起并保留焦点，账号偏好沿用 `railCollapsed`。平板默认收起，可在当前视口临时展开，不覆盖桌面偏好。
- 页面共用玻璃顶栏与左右插槽；仓库菜单、同步状态弹层、账号菜单、主题与 Token 切换、退出和 toast 接入现有 Provider。读取错误区分网络、权限、Token 与普通失败，暂时失败保留内容。
- 原顶栏读取来源、设置与重复入口已替换。尚未迁移的页面暂用原布局容器，随着 T5–T11 替换；旧参数清理纯函数已准备，随 T8 / T11 页面迁移接入，以免提前删除仍在迁移的旧控件。
- 迁移 workspace、automatic-refresh、account-connections、changes、prototypes、sharing 的壳层定位与辅助操作，保留业务断言；未删除业务覆盖。

验证：
- `npm run typecheck`、改动文件 Prettier 检查、`npm run build` 通过；`tests/shell-state.test.ts` 两项通过。
- 修复后的 `npm run test:e2e -- --list` 正常加载 102 项，不再需要手动附加 `NODE_OPTIONS`。
- workspace、automatic-refresh、collaboration-source、central-sources、access 共 11 项浏览器测试通过，覆盖三档布局、320px 顶栏、焦点、菜单、主题、刷新、离线/失权、延迟响应与自定义集成分支。
- 其余凭据与页面回归随 T5 / T6 及最终整体验证继续执行。原 T3 服务生命周期环境失败尚未复核，不据此声称完整单测通过。

## T5 · 我的仓库与登录注册

范围：
- 仓库页按原型替换为居中列表，直接显示名称、路径与集成分支；配置异常单独进入“需要处理”组，重新检查预填原仓库和分支。保留发现进度、部分失败与限流、分页、重新发现和自定义集成分支检查。
- 删除仓库状态页签、阅读来源列、逐行“可阅读”、重复身份入口、眉标与宣传卡片；不再以状态页签组织仓库。原业务断言保留，仓库定位改为有名称的列表与链接。
- 未登录时独立显示居中登录 / 注册卡片，不渲染工作台导航；保留 Unicode 账号密码限制、确认密码、重复账号、错误及限流反馈。首次无 Token 显示绑定引导，已有绑定可进入设置选择。
- 添加 Token 与仓库检查表单提取为共享组合，使用 T2 的实底对话框、焦点恢复与 scoped 样式。Token 验证失败清空输入并保留账号和原选择，关闭对话框中止请求；加入 Pull requests 只读权限说明。

验证：
- 类型检查、Prettier、生产构建通过。
- 将源码复制到独立临时验证目录，依赖以只读使用的硬链接复用；浏览器测试不会受随后 T6 编辑影响。personal、account-connections、collaboration-source 16 个不同用例通过（首轮 13 项通过；修订旧页面期待与 Next 路由播报器定位后复验 2 项，并新增仓库分组测试）。
- 覆盖注册到绑定到阅读、浏览器重开、失效绑定、跨浏览器与 A-B-A 延迟隔离、自定义分支、重复账号、密码不一致和限流；仓库页在 1440 / 834 / 320 × 浅 / 深主题均无横向溢出，已实际查看桌面浅色与手机深色截图。
- 账号设置旧布局仍由 T6 继续替换；测试中仅调整入口名称和首次绑定引导的期望，未删减认证或权限断言。
