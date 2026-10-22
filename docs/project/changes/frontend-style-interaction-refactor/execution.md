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

## T6 · 账号与 Token 设置

范围：
- 账号卡片、Token 列表与登录设备在同一页展示，移除原来的账号管理页签与旧页面实现。Token 行保留当前标记和其他 Token 的“使用”，重命名、复制当前 Token、解绑进入更多菜单；非当前 Token 的复制禁用并说明需先选用。
- 添加 Token 沿用 T5 验证表单；设备撤销、退出当前设备与退出全部设备均有确认说明，退出保留账号绑定。当前设备只显示标记，不提供逐行退出；全设备退出放在页面底部。
- 复制仍只在点击后请求，失败提供手动选择文本；关闭清除敏感值并回到原菜单按钮。组件按设备会话与 epoch 隔离，保留中止、版本和延迟响应处理；明确失效的当前 Token 有提示与重新绑定入口。
- Button / IconButton 的类型补齐 React 19 原生 ref 属性，供菜单和对话框焦点恢复使用，运行时继续透传原生属性。主页面全部使用 scoped 样式，窄屏账号操作另起一行以容纳长名称。

验证：
- 类型、Prettier、生产构建、UI 生产构建与 ui:test 通过。
- 完整 `npm test` 288 / 288 通过，包括 T3 记录失败的 service lifecycle；该环境问题已解除。
- personal、account-connections、credentials、token-workspaces、settings 共 27 个不同浏览器用例通过（首轮 24 项，修正两处新确认/portal 定位后复验，加一项切换失败验证）；窄屏样式调整后重跑 1440 / 834 / 390 / 320 的复制兜底、焦点、绑定和退出四项，均通过。
- 已查看桌面与 320px 的真实账号页截图。原账号/Token/设备/延迟响应的业务断言保留，页签选择改为同页区域定位，新增退出确认操作。

## T7 · 阅读布局与 Specs

范围：
- 新通用 Reader 提供独立滚动的能力/材料目录、正文与本页目录，玻璃顶栏浮在各滚动区上方；窄屏目录与章节进入 Sheet，章节跳转保留 URL、焦点与顶栏下方的阅读位置，滚动同步高亮。
- 字号（15.5 / 17.5px）、专注阅读保存于本机；目录可独立收起并恢复。Markdown 采用新 prose 样式，表格/代码独立横向滚动，图片与 SVG 沿用既有安全读取与授权逻辑。
- Specs 使用新布局与 scoped 能力树；正文内的能力链接在阅读页切换，旧 doc/da 参数映射到所属能力，原文改为侧边/底部抽屉。复制阅读链接与原文进入正文更多菜单，链接仍携带真实能力与分支。文末按有效记录的 relatedSpecs 展示相关 Change 与创建者。
- 保留目录折叠偏好、深链接展开祖先、无能力/无来源/失权等边界；复制链接逻辑抽成共用 hook。旧 Change 材料页仍待 T9 迁移，不提前改其抽屉行为。

验证：
- 类型、格式、生产构建通过。
- specs、svg、sharing、collaboration-source、automatic-refresh 首轮 12 项通过，手机规格发现正文被自动放进零宽网格列，修正为显式列/行定位；重跑 Specs 4 项并新增阅读设置/锚点/手机目录交互，5 项全过，合计 14 个不同用例通过。
- 覆盖安全 Markdown 与 SVG 像素/CSP、图片原文、链接范围、匿名协作者登录后恢复、来源分支、自动刷新与失权、目录祖先、原文焦点、字号持久化和专注阅读；834 / 390 / 320 实际截图无横向溢出，已查看桌面与 320px 画面。
- 将旧测试中不存在的 .specs-tree 选择器改成真实的“能力目录”导航断言，保留并加强私有内容清理覆盖。完整详情/分享布局在 T9/T10 后再整体验证。

## T8 · Changes 列表

范围：
- 新列表与只读阶段看板使用 scoped 样式，范围缩为进行中 / 已完成 / 已取消；进行中按等待确认、受阻、推进中分组，可切阶段或不分组；已完成按交付状态分组。来源异常通过有记录才出现的提示条进入。
- 一行工具栏承载类型、紧急程度、创建者筛选与显示设置，选中条件有可单独清除的标签。保留无类型、多选类型和任意自定义标签；紧急程度多选时用 JSON 数组，单项仍兼容原 URL 值。创建者不足以区分时不显示冗余选项，URL 中失去匹配的选择仍可清除。
- 行内直接展示首次提交创建者与时间、紧急旗标、标签、等待/受阻原因、阶段与任务/子项进度、交付标签和 PR。PR 与标题是平级链接，不嵌套。归档/取消行显示实际事件日期；延续交付分组与缺失前序提示保留。
- 删除旧任务粒度、全局依赖视图、规模/阶段/等待/关联能力/任务状态筛选、待集成/待发布/来源异常页签及对应渲染函数；旧 URL 由 T4 准备的映射清理。详情中的任务、依赖、取消、归档与来源证据继续可读，详情布局留到 T9。

验证：
- 类型、格式、生产构建通过；新增分组/筛选/排序单测与既有标签、延续单测共 13 项通过。
- changes、change-labels、change-directory、delivery、follow-ups 共 21 个浏览器用例通过（首轮 19 项，修订可见重复文字与分组数量的定位后复验 2 项），并跑过 workspace 4 项；来源视图、取消与空态调整后另复验 3 项，均通过。
- 覆盖 OR/AND、多选与不存在标签、JSON 参数与前进后退、创建者和创建时间、紧急排序、任务顺序、只读看板、交付 PR/历史/失效状态、延续分组、缺失来源、深链接、返回焦点。1440 / 834 / 390 / 320 × 浅 / 深主题无横向溢出，长标签和恶意 HTML 均按文本显示，已查看桌面浅色和 320px 深色截图。
- 测试移除已删除控件的操作和纯旧装饰布局断言；任务顺序、依赖满足、父子关系和所有交付/取消/认证断言保留在详情或新列表位置，未以任务数推导验收。
