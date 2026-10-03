# 原型预览执行记录

## T1：统一原型关联与项目配置校验

新增无第三方依赖的共享契约供 hook、工具和服务使用。扩展可选字段，保留旧数据读取；非法原型关联单独诊断。提交校验检查暂存 HTML 的路径和 blob 模式，拒绝仅在工作区存在的文件、符号链接和删除仍被引用的入口；禁用后允许普通流程更新及删除旧关联。setup 安装器连同共享契约交付，并保留已有自定义脚本。

验证：`npm run typecheck`；`node --conditions=react-server --test tests/prototype-contract.test.ts tests/changes.test.ts`（11 项）；`node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`（5 项）。均通过。新功能端到端与 UI 尚在后续任务范围。

## T2：原型子 skill 与本地交付工具

交付 SpecTrail 内 prototype 子 skill、接入脚本、基础包和共享资源内联导出、静态/Chromium 检查、归档标签推送工具。主 skill 仅保留入口和归档交接。初始化保留已有内容，失败留 pending；拒绝决定持久化；同名异提交标签拒绝覆盖。

`node --conditions=react-server --test tests/prototype-tools.test.ts` 的 4 项场景通过：拒绝/重新同意/幂等接入与设计引用、失败恢复与 symlink 输出保护、运行时网络依赖被 CSP 验证捕获、远端归档标签发布/重试/冲突。修正首次复制到空目录时的 Node cp EEXIST 后复验通过。`quick_validate.py` 和 `npm run typecheck` 通过。浏览器工具仅验证初始加载，正式页面交互和设备适配仍需 T4/T5 验证。

## T3：固定 Git 读取与同域隔离

扩展专用归档引用采集，归档开发分支删除后仍可读取标签中的记录；保存已观察的标签目标以诊断后续改写。预览按完整提交读取项目配置、关联与 HTML，当前配置基线仍控制所有版本的功能开关。只暴露已关联入口，拒绝任意路径、无效 SHA、symlink、LFS 和超限内容；非法单项保留其他有效入口。preview 根只枚举元数据做总量检查，不下载未关联正文；该保守限额口径已同步 Technical。

新增主 API 入口描述和 GET/HEAD HTML 路由，复用同域认证；CSP sandbox 不含 allow-same-origin，禁用网络、父页面访问和持久存储，预览响应覆盖全局 X-Frame-Options: DENY 为 SAMEORIGIN。缓存格式升级为 2，旧缓存可重新读取重建。

`npm test` 的 24 项核心/工具测试通过；`npx playwright test tests/browser/previews-api.spec.ts` 的 3 项通过；`npm run typecheck` 通过。实测固定历史提交跨文档快照淘汰、删除归档开发分支后冷缓存重建、标签改写/删除拒绝、当前停用撤销历史预览、同域 iframe 交互与父 DOM/Cookie/存储/API 隔离、直接打开响应头沙箱、资源限额和项目配置移除。

## T4：Change 内原型浏览

新增原型标签、多入口、声明设备和旋转、自定义组件视口、画布适应与 100%、固定 Git 版本链接；保留现有抽屉和文档阅读。缩放只作用于展示，不改变 iframe 的布局尺寸。错误入口、失效版本、当前禁用、沙箱运行异常均给出可读提示。

`npx playwright test tests/browser/previews.spec.ts tests/browser/changes.spec.ts` 的 10 项测试通过；`npm run typecheck` 通过。测量实际 iframe 视口，覆盖 PC/iPad/移动端与 640px 局部组件、方向切换、深链接恢复、错误入口及移动端抽屉滚动。

## T5：真实包与运行环境集成

通过子 skill 初始化本仓库的 `packages/prototype` npm workspace，引用主应用设计规则。两个页面和一个 640×320 组件复用共享样式、页头与内联品牌素材，三个入口直接关联当前 Change。新增运行、配置基线、导出限制、归档保留和缓存升级说明。

真实接入发现本地 Playwright 的 CommonJS 入口只有 default 导出；修正 T2 浏览器校验工具的模块解包，回归改为使用项目内默认解析，原有 ESM 指定路径仍由运行时网络失败用例覆盖。`npm run build --workspace prototype` 和默认参数的 `validate.mjs --browser` 已验证三个真实产物。完整验证：`npm test` 24 项、setup hook 5 项、`npm run test:e2e` 21 项全部通过；`npm run typecheck`、`npm run format:check`、子 skill `quick_validate.py`、`OPENFOLIO_BUILD_DIR=.next-prototype-preview npm run build` 通过。

生产构建先在独立端口和新缓存读取中心 Git 的 `ee2a2bc`。三个入口均可读取；真实样例验证 PC 1440、iPad 834、移动 390 和组件 640 CSS px，搜索/筛选、hash 状态、展开步骤、组件选择均正常，内联品牌图片和 data 字体可加载，没有额外子资源请求或运行错误。验证使用本地带 HttpOnly/SameSite=Lax Cookie 的认证代理；真实私有网关的匿名请求返回 401，未持有用户登录态，已登录网关的最终体验留给用户验收。

验收实例已切换到新构建，仍由 10681 经原 11356 私有代理提供服务。切换后重新执行三个真实入口交互与尺寸验证通过，代理转发读取正常。运行目录使用独立的新格式缓存，旧缓存保留用于回退；服务配置的原型基线为当前 Change 分支，未修改远端 main。

## T6：独立评审与交付复验

隔离会话 reviewer 覆盖完整差异并执行子 skill 的正向流程。整体验收复查记录 R1、R2 见 Review，分别修正 T3 的旧归档空态与 T2 的 annotated tag 核实；5 项预览核心回归和 5 项子 skill 工具回归通过，格式和类型检查通过。需求/技术正文同步最终交付表达，已实现能力仍等待用户验收后才同步 Specs。

独立行为验证完成 Yarn 项目接入、3 个入口、跨 Change 复用、本地交互、归档推送和删分支/冷缓存后的版本恢复。R2–R7 的独立发现与修正见 Review。修正后 `npm test` 为 31 项通过；hook 为 5 项通过；原型 API/UI 浏览器复验为 6 项通过。重新导出本项目 3 个入口无无关产物差异，离线浏览器校验、类型、格式、skill 结构校验通过。

| 验收 | 交付证据 |
| ---- | -------- |
| A1、A2 | 契约/暂存校验与子 skill 工具测试；独立 Yarn 正向流程；pnpm 排除规则与失败恢复回归 |
| A3 | 本项目两个页面和一个组件共享源码；跨 Change 复用测试及独立流程 |
| A4 | UI 浏览器测量实际 CSS 视口、设备/方向、适应与 100%、固定版本链接恢复 |
| A5 | 真实 Git 样例的图片、字体、内联 module/mock、hash/本地交互，无额外子请求；正式生产构建下的认证代理验证 |
| A6 | 工具归档推送/重试/冲突、annotated tag；删开发分支、冷缓存、共享源码更新、旧文档快照淘汰与引用删除/改写 |
| A7 | 局部非法关联、缺失/LFS/超限、停用、旧归档空态与读取失败回归；不隐藏核心文档 |
| A8 | 同域 iframe 和直接导航的沙箱；DOM/存储/Cookie/API 隔离，Host/Origin/路径/项目/版本边界；真实私有页面与预览 URL 匿名访问均为 401 |
| A9 | 既有核心/浏览器/hook 回归；旧字段兼容和无原型归档；缓存格式升级与客户端配套升级说明 |

边界：预设设备只决定 CSS 视口；运行时只支持自包含 HTML 的局部交互。pnpm 自动接入识别分行 packages glob 列表，其他 YAML 表达需保留配置并规范化该列表；脚本失败不写 enabled。真实网关已登录会话未自动化访问，最终以用户验收为准。

最终独立复验无剩余可行动问题，内容一致性和 31 项核心测试由 reviewer 再次核对。修正后的生产构建 `.next-prototype-reviewed` 通过并更新到原 10681/11356 私有入口；刷新中心 Git 后真实三个入口的交互、尺寸、内联资源验证通过，旧归档正常显示“尚未关联原型”。未验收能力不提前同步 Specs，归档保留标签将在用户接受本 Change、完成正常归档时创建。

## T7：项目级原型总览

按用户验收反馈，补齐与 Specs、Changes 并列的原型页面。只读汇总快照中各 Change 的权威关联，以路径和类型合并共享入口，显示页面、组件及关联 Change 数量；保留来源选择、声明适配和自定义尺寸。支持搜索、类型与设备筛选，直接复用 Change 预览抽屉，固定链接保留总览入口，也可跳到来源 Change。

列表仅统计有效关联，不提前读取或执行 HTML，也不把关联数量当作可用产物数量。非法单项不遮蔽有效条目；来源不明确时给出诊断而不猜测。当前项目开关仍控制历史预览，停用保留关联清单。项目切换清理原型上下文，分页和筛选避免长列表一次铺开。

验证：`npm test` 33 项、`npm run test:e2e` 26 项、`npm run typecheck`、`npm run format:check`、`git diff --check` 全部通过。新增真实临时 Git 场景覆盖共享入口、陈旧分支、局部非法关联和当前停用；浏览器覆盖数量、来源选择、组合筛选、固定链接、前进后退、项目隔离、异常与空态。实际检查 1440px 桌面和 320px 手机效果，手机无横向溢出，组件仍使用声明的 640 CSS px 视口。A10 自动化交付已覆盖，独立复核和验收实例更新由 T8 继续。
