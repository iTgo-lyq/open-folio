# 前端样式与交互重构：实施计划

实现验收返修按 T13 → T14 → T15 → T16 → T17 → T18 推进；用户本轮连续补充的反馈是调整依据。任务完成提交后继续下一项，浏览器验证在独立快照中运行，最终汇总受影响回归、独立评审和体验服务验证。

按[需求](requirement.md)、[技术方案](technical.md)与已验收原型 `06e078ce` 交付，默认 T1 → T2 → … → T12 串行执行；任务状态只维护在 change.json，执行证据按任务编号写入 Execution，评审问题写入 Review。

## 前置与移交

- 前置 `change-sharing` 已满足：归档 `docs/project/archive/2026-10-21-change-sharing/`，合入提交 `3dcd334`。执行开始时把这两项依据写入 Execution（本 Change 未声明 `dependsOn`，见 Technical“依赖与前置”）。
- Plan 确认后，从最新 `develop` 移交到工作分支 `change/frontend-style-interaction-refactor`，worktree 为 `/home/tiger/workspace/open-folio-worktrees/frontend-style-interaction-refactor`；缺少 `.env` / `.env.local` 时从主工作区复用。实现、状态与证据只提交到工作分支，全部完成并通过关闭流程后经 PR 合入 `develop`，再按项目约定更新 11117 长期服务。

## 交接约定

本计划可能由多个 Agent 先后执行。每次接手先读 change.json 的任务状态、本文、Technical 与 Execution 的最新任务记录，再看工作分支最近提交；`doing` 的任务从 Execution 中的未完成事项续做，不重做已完成任务。

- **视觉与交互规格**：原型源码 `packages/prototype/src/shared/quiet-workbench/`（`develop` 上即验收版本，源码提交 `9351a48`），规则摘要见原型包 DESIGN 中本 Change 一节。固定预览：`https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/06e078ce433a283f7767337163f8b70c08c4270c3b43a275a47cc4a76be0053b/<入口>/index.html`，入口为 `quiet-home`、`quiet-specs`、`quiet-changes`、`quiet-prototypes`、`quiet-credentials`、`quiet-public`、`quiet-share`；hash 可直达页面与状态，如 `#/changes/offline-map-regions?theme=dark`、`#/changes?side=collapsed&scene=offline`。原型的评审栏、示例数据和强调色对照不属于产品。
- **实现约定**：颜色、间距、圆角、阴影与材质只引用 `--of-*` token；基础组件放 `packages/ui`（`of-ui-` 前缀普通 CSS，交互用 `radix-ui`，新增前按包 README 用 shadcn CLI 查看来源），业务组合放 `src/components` 并使用同目录 CSS Modules；图标用 `lucide-react`。沿用 `PersonalProvider`、`WorkspaceProvider`、`SharedProvider` 与查询参数路由，不改服务端接口（T3 除外）。文案以原型为准。写代码前按 AGENTS.md 查阅 `node_modules/next/dist/docs/` 中相关指南。
- **每个任务的收尾**：`task-start` → 实现 → 运行本任务验证及受影响的既有测试 → 在 Execution 记录范围、命令、结果与未解决事项 → `task-complete --verification` → 提交（标题 `frontend-style-interaction-refactor T<n>: …`）并推送工作分支。中间提交须能构建；未迁移的页面允许暂时沿用旧样式，但不得报错或丢失功能。
- **常用命令**：`npm run typecheck`、`npm run format:check`、`npm test`、`npm run build`（工作分支 worktree 内）、`npm run test:e2e`（Playwright 使用 `.next-e2e` 与 10682 端口，可用 `npx playwright test tests/browser/<文件>` 只跑相关用例）、`npm run ui:build && npm run ui:test`。截图与交互自查可参照 `packages/prototype/verify-quiet-workbench.mjs` 的布局矩阵写法。
- **对照用例**：迁移既有浏览器用例时保留其业务断言，只把定位改为新结构的角色与可访问名称；被需求删除的能力（规模 / 关联能力 / 阶段 / 等待 / 任务状态筛选、任务粒度、全局依赖视图、来源异常与待集成 / 待发布页签、原型类型页签）连同其断言一起删除，并在 Execution 列出删除了哪些断言。

## T1 · 主题、设计 token 与品牌标志

交付浅色 / 深色两套新 token（取值按原型 `style.css` 与 DESIGN，陶土强调色），以新名称与现有 `--of-*` 并存；`<html data-theme>` 主题机制：默认跟随系统，选择保存在本机，根布局以内联脚本在首帧前写入。减少动态效果的全局规则随 token 放在组件包样式中；原生控件配色由已迁移容器声明 `color-scheme: var(--of-color-scheme)`。正文 prose 样式随 T7 阅读布局交付，便于对照验证。旧 token 与旧样式保持不变，尚未迁移的页面暂不跟随深色主题，T12 统一删除。品牌标志组件内联墨色平面矢量，替换现有三处 `openfolio-mark.png` 引用；`app/icon.svg`、`apple-icon.png` 与重新生成的 `favicon.ico` 取代旧图标。

验收：浅色、深色、跟随系统三种来源下首帧主题正确且无闪烁，刷新后保持选择；标志在两种主题下正确着色；浏览器标签显示新图标。尚未迁移的页面外观与功能不变。

验证：`typecheck`、`build`；浏览器用例覆盖系统深色、手动切换与刷新保持、首帧 `data-theme`；检查 `/`、`/share`、`/preview/<id>` 都带主题。

## T2 · 共享基础组件

在 `@open-folio/ui` 交付菜单（普通 / 单选 / 多选项）、弹层、对话框与左 / 右 / 底部抽屉、提示、分段控件、开关、头像与字标、状态标签色调，并按新 token 重做 Button、IconButton、Badge、Card、Tabs、Field / Input 的视觉。抽屉与弹层的外层使用玻璃材质，内部阅读区实底。补齐组件预览示例。

验收：组件可从包入口导入；方向键、Escape、焦点限制与回到触发控件、触摸操作符合原型；浅色 / 深色及 390px 宽度下预览无溢出；既有调用方编译通过、行为不变。

验证：`npm run typecheck`、`npm run ui:build`、`npm run ui:test`（扩展预览交互断言），`npm run build`。

## T3 · Change 创建者读取

交付 Git 读取层在追溯首次加入 `change.json` 的同一次扫描中取得作者，`ChangeGroup.creator`（名称，GitHub noreply 邮箱可识别时附登录名，不输出邮箱），快照缓存版本 8 → 9，分享接口组装单个 Change 时带上创建者。界面暂不使用该字段。

验收：工作台与分享接口返回首次提交作者；历史无法确定时省略；旧缓存自动重建；账号、凭据与公开原型不受影响。

验证：扩展 `change-creation-order`、`changes`、`store` / `incremental-cache` 与 `shares` 单元测试，覆盖多作者、归档迁移、noreply 两种格式、普通邮箱不泄露；`npm test`。

## T4 · 工作台壳层与导航

交付新的侧栏（展开态；点击标志或 ⌘\ / Ctrl+\ 收起为悬浮胶囊；沿用 `railCollapsed`）、平板默认收起、手机底部胶囊导航；浮在内容面上的玻璃顶栏与页面左右插槽；“同步状态”按钮与弹层（已同步 / 正在读取 / 离线 / 同步失败 / 无权限 / Token 失效，含来源、快照时间与刷新）；侧栏底部账号菜单（切换 Token、账号与 Token 设置、浅色 / 深色、退出登录）；仓库切换（侧栏与收起时的顶栏紧凑版）；提示条（toast）。旧查询参数按 Technical 的映射在读取时清理。删除旧顶栏设置图标、读取来源下拉与首页身份区入口。

验收：对照原型 `quiet-home` 的侧栏、收起、平板与手机形态；各模块切换、仓库切换、Token 切换失败保留原选择、刷新与离线状态可演示；键盘可完成收起与菜单操作并保持焦点；内容从顶栏下方滚过。

验证：迁移 `workspace`、`automatic-refresh`、`token-workspaces`、`collaboration-source`、`central-sources`、`access` 等用例；新增查询参数映射单元测试；`typecheck`、`build`。

## T5 · 我的仓库与登录注册

交付仓库首页（可读仓库列表；需要处理的仓库单独成组并附原因与重新检查 / 切换 Token；发现进度与加载更多；添加仓库检查对话框），未登录的登录页与注册页（错误、限流、重名），已登录无 Token 时绑定首个 Token 的引导。删除状态页签、阅读来源列与逐行“可阅读”标记。

验收：对照原型 `quiet-home` 与 `quiet-credentials` 的 `#/login`、`#/register` 及“正在发现 / 部分失败 / 没有仓库 / 尚未绑定 Token”场景；注册后能引导绑定并进入仓库。

验证：迁移 `personal`、`account-connections` 用例；`typecheck`、`build`。

## T6 · 账号与 Token 设置

交付账号与 Token 页：账号卡片；Token 列表（当前使用标记，更多菜单中命名、复制当前 Token、解绑）；添加 Token 对话框（验证失败不保存、不影响原选择）；登录设备列表（当前设备只做标记，可退出其他设备）；页面底部的退出全部设备（确认说明 Token 保留）。

验收：对照原型 `quiet-credentials` 的正常、尚未绑定、Token 失效、切换失败与复制失败场景；复制仅在点击后发生，剪贴板不可用时提供手动复制。

验证：迁移 `credentials`、`token-workspaces` 相关用例；`typecheck`、`build`。

## T7 · 阅读布局与 Specs

交付正文 prose 样式与通用阅读布局组件（左侧目录面板、正文、右侧本页目录；目录随滚动高亮并以顶栏下沿为起点；窄屏目录与面板收入抽屉；字号与专注阅读存本机）与 Specs 页：能力树、文档正文、文末“相关 Change”、正文顶部更多菜单（复制阅读链接、查看原文抽屉）。`s`、`anchor`、`doc` / `da` / `raw` 在 Specs 内按 Technical 处理。

验收：对照原型 `quiet-specs`；长文、表格、代码、图片与 SVG 图示可读；章节跳转后标题不被顶栏遮挡；手机可打开目录并返回原位置。

验证：迁移 `specs`、`svg` 用例；`typecheck`、`build`。

## T8 · Changes 列表

交付一行工具栏（范围分段、“筛选”弹层：类型 / 紧急程度 / 创建者及可清除标签、“显示”弹层：列表 / 看板、分组、排序）、进行中按“等待确认 / 受阻 / 推进中”分组、已完成按交付标签分组、列表行（标题、ID、类型、紧急 / 高旗标、等待原因或受阻任务、PR 状态、阶段、任务进度、创建者、创建时间）、只读看板（进行中）、来源异常提示条与空态。分组、筛选、排序写成纯函数。删除被需求移除的筛选、视图、页签与对应组件。

验收：对照原型 `quiet-changes` 的列表、看板、筛选、各分组与“筛选无匹配”；延续分组、交付标签与 PR 链接保留；返回列表保留滚动与焦点；平板与手机不溢出。

验证：新增分组 / 筛选 / 排序单元测试；迁移 `changes`、`change-labels`、`delivery`、`follow-ups` 用例；`typecheck`、`build`。

## T9 · Change 详情阅读页

以完整阅读页取代 Change 抽屉与文档弹窗：材料目录（概览、任务、需求、技术方案、计划、执行记录、评审记录、原型、合入变更、依据；未产生置灰，缺失单独提示）、内联正文与本页目录；概览（等待 / 受阻提示、进度、交付与 PR、关联、澄清问答）；顶部阶段流程、返回列表、上一项 / 下一项（按当前列表顺序）、“分享”弹层（沿用 `ShareManager` 的地址与复制兜底）。合入文件与 diff、原型预览改为新样式，逻辑沿用。`ct`、`doc` 等参数与旧页签值按 Technical 映射。

验收：对照原型 `quiet-changes` 的详情、材料缺失、合入异常与复制失败场景；工作台“复制页面链接”恢复同一材料；不出现编辑或推进操作。

验证：迁移 `changes`（详情部分）、`integration`、`previews`、`delivery`（详情部分）、`sharing`（工作台入口部分）用例；`typecheck`、`build`。

## T10 · Change 分享页

分享页改用 T9 的阅读布局与材料组件，数据继续来自 `SharedProvider`，同步其参数白名单；单行玻璃页头（仓库、只读分享、阅读设置、复制链接、主题），去掉私有导航与操作；不存在 / 暂不可读、同步失败（保留已显示内容）与加载状态。删除 `shared-change.css`。

验收：对照原型 `quiet-share`；全新匿名浏览器可阅读全部材料与 diff，不请求私有接口；材料深链、范围外引用提示与刷新跟随最新推送保持 `change-sharing` 的语义。

验证：迁移 `change-sharing`、`shares` 相关用例；`typecheck`、`build`；`share.mjs` 对测试服务的匿名核实路径不受影响。

## T11 · 原型总览、画布与公开原型页

交付原型总览（“预览设备”分段同时切换缩略图；卡片显示名称、说明、适配、关联 Change、公开状态，组件以标签标注；分页）、详情抽屉、预览画布工具栏（设备、方向、适应 / 100%、重载、公开链接准备与复制）与公开原型页（单行玻璃页头 + 满屏画布；不存在与已撤回）。缩略图与画布的加载、沙箱与公开逻辑沿用。删除类型页签。

验收：对照原型 `quiet-prototypes` 与 `quiet-public`；截图进入画布、说明区打开详情可分别用键盘操作；返回保留位置；iframe 仍只授予 `allow-scripts`。

验证：迁移 `prototypes`、`thumbnails`、`hosting`、`sharing`（公开原型部分）用例；`previews-api` 保持通过；`typecheck`、`build`。

## T12 · 旧样式清理与整体验证

删除旧 `globals.css` 中已无引用的样式与旧 `--of-*` token，确认不再引用旧类名与 `public/brand/openfolio-mark.png`。新增布局用例：工作台各页面、Change 详情、合入差异、画布、登录、公开原型与分享页在浅色 / 深色 × 1440 / 834 / 390 / 320 下无横向溢出，覆盖侧栏收起与胶囊、键盘路径与焦点返回、减少动态效果、对比度取值（主按钮、链接、选中与状态标签 ≥ 4.5:1，焦点框与侧栏强调色 ≥ 3:1）。完成后进行独立评审，问题写入 Review 并按需追加返修任务。

验收：全部既有与新增测试通过；对照原型逐页走查无遗漏的入口与状态；Review 中的问题均已处理或有保留理由。

验证：`npm run format:check`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`、`npm run ui:test`；记录各命令结果。之后进入关闭：整体验证；用户验收（在工作分支的独立端口测试实例上演示，不改动 11117）；同步 Specs（删除的筛选与视图、创建者、主题等）；归档并经 PR 合入 `develop`；合入后更新 11117 长期服务并以 `withSmokeSession` 做真实冒烟。

## T13 · 阅读目录、抽屉与顶栏返修

目录开关常驻顶栏左侧，改善桌面收起/展开和手机目录焦点。阅读原文/文档使用更宽的专用抽屉。Changes 与原型的唯一大标题进入顶栏；删除当前页面地址复制入口。网站侧栏首次默认收起，已保存的显式展开/收起继续生效。

收起态 Logo 移除文字占位并居中；Change 材料来源缩为文件路径与提交的一行；Specs 相关 Change 仅显示最新五项。

验证：Specs、Change Reader、目录焦点、原文/资源深链、顶栏标题与首次侧栏偏好；双主题及四档宽度截图；类型、格式及生产构建。

## T14 · Change 分组层次与边距统一

加强分组与连续交付组标题，降低单条 Change 标题字重；所有列表行、表头及分组标题使用统一水平起点，连续交付容器不额外缩进行内容。看板和窄屏的既有分组、排序和点击语义保持。

验证：目录/延续分组/列表看板切换和筛选回归；测量分组内外标题与表格列的左右边界，检查长标题和320px布局。

## T15 · 旧原型与分享入口清理

清理当前清单及源码中已被七组新设计替代的旧入口；保留历史固定发布产物。定位验收分享地址的失败层，修复可行动原因并验证匿名页和有效复制入口。汇总本轮验证与独立评审，再更新同一体验服务供最终验收。

验证：原型清单/构建/读取契约、真实分享地址及无登录浏览器读取、匿名无私有接口、固定版本及原有权限/沙箱边界；受影响浏览器套件与独立评审。

## T16 · 恢复 Changes 与原型内容区标题

按用户后续验收反馈，撤回 T13 中两处大标题进入顶栏的调整，恢复 Changes 与原型总览的原有内容区标题位置、标题间距和原型入口数量；备用焦点随原型标题恢复到内容区。

验证：标题唯一且位于内容区，原型详情关闭与画布返回焦点、双主题四档布局、类型和格式；生产构建后更新同一验收服务并以已有账号冒烟。

## T17 · 阅读目录收起为顶栏位置按钮

按[实现验收补充](requirement.md#实现验收补充2026-10-22)第 12 项，更正 T13 的顶栏目录开关：收起按钮移入目录面板标题行，收起或窄屏时顶栏左侧显示与仓库按钮同形的当前位置按钮，弹出目录并可在桌面恢复侧栏。

验证：Specs、Change 与匿名分享页在 1440 / 834 / 390px 的收起、弹出、跳转、恢复与焦点；类型、格式及受影响阅读浏览器用例。

## T18 · 抽屉贴边玻璃与遮罩模糊

按第 13 项，抽屉贴合窗口边缘并改为单层玻璃，去掉内嵌实底卡片；遮罩模糊背后页面。覆盖原文、文档、本页目录、原型详情与画布目录抽屉。

验证：浅色 / 深色与 1440 / 834 / 390px 截图复核；抽屉相关浏览器用例、`ui:build` / `ui:test`、类型与格式。

## T19 · 位置按钮与抽屉评审修正

收尾位置按钮弹层的宽度切换、修饰键、选中项可见性与分隔符可访问文本；手机返回按钮为当前材料留出空间。

验证：目录弹出、选择、恢复、窄屏焦点与阅读/分享回归，类型和格式。

## T20 · 统一顶栏位置按钮与路径间距

Specs 与 Change 详情的顶栏位置按钮同左侧仓库或返回按钮使用一致的高度、字号、字重和内边距；分隔符两侧到按钮的间距一致，侧栏展开时的首项不留分隔占位。

验证：两页桌面/平板/手机的实际按钮几何与字体、分隔符两侧间距、长标题截断及目录弹层焦点；更新同一验收服务后以原有账号复验。

## T21 · 统一阅读目录密度与轻量图标

对照规范与 Change 材料列表，将 Specs 行高、垂直留白、图文间距和选中字重统一到相同节奏；树层级和长标题换行保留。目录树箭头及共享目录展开/收起图标采用 1.5 线宽。

验证：Specs 深层级、目录折叠、选中和窄屏弹出回归，类型与格式；更新同一验收服务后比较真实两页目录尺寸，并检查双主题和三档宽度及细线图标。

