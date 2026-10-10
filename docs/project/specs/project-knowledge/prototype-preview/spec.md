# 原型浏览与预览

OpenFolio 在[项目知识工作台](../spec.md)提供独立「原型」模块，以及 [Change 详情](../change-tracking/spec.md)内的原型标签。总览展示 main 当前登记的项目页面，Change 保存当时的固定交付。宿主维护源码、构建和托管，OpenFolio 只读取已推送引用及 Git 兜底产物，不编译源码、接收上传或运行宿主命令。

## 可选协作与当前清单

每项目维护一个原型包，默认 packages/prototype，复用项目设计规范与组件库。源码可使用 HTML、React 或其他宿主工具，演示使用局部状态与 mock，不依赖真实业务后端。UI 组件库的独立预览不自动进入项目原型清单。

docs/project/workflow.json 的 prototype 记录选择：缺失为未选择，disabled 为拒绝，pending 为接入未完成，enabled 为可用。拒绝后不重复提议或新增关联；已有明确同意直接沿用，初始化失败保留现场。已启用且明显改变 UI 的 Change 建议优先制作或更新原型，未采纳建议或没有 previews 不阻断流程。

原型配置只维护当前 status 和适用的 packagePath，接入决定的历史由 Git 保存。

工作台从已推送 main 的最新成功快照读取开关与包配置，不随 Specs 分支切换。旧版本不能绕过当前停用选择；没有 main、配置不可读或清单损坏时明确说明。

包内 prototype.json 是当前总览唯一清单，schemaVersion 为 1，entries 按稳定 id 声明 title、可选 description、sourcePath、kind、适配和可选 artifact。源码路径位于原型包内，id 在项目内唯一。页面声明 pc-web/ipad/mobile 中非空、去重的设备集合；组件在设备集合和 1–4096 CSS px 的整数 viewport 中二选一。无 artifact 表示尚未交付，不从 Change 历史推算当前版本。

Git 保存源码和描述，普通 dist 默认忽略。删除 main 清单项即从总览移除，不删除历史交付；开发分支或仅上传未登记的产物不改变总览。源码、主题变化不强制重发参考原型。

## 固定产物与宿主发布

artifact 区分两种交付：

- hosted：记录固定 version、HTTPS url、sourceCommit、digest，以及可选设备截图引用。宿主自行构建并上传到自己的静态托管，支持 React 等多文件产物。
- git：记录 path 与 sourceCommit。显式选择兜底时，当前单 HTML 留在包内 preview/id，Change 另保存 previews/id/index.html；归档移动快照并更新路径，后续当前产物更新不覆盖旧 Change。

Change 的 previews 保留自己的入口标题、类型、适配及固定 artifact；项目当前清单与 Change 可引用同一次发布。当前清单后续更新不改变 Change 的固定交付，已归档记录只读。源码提交可用于追溯构建来源。

发布工具 prepare 生成包含仓库、源码提交、目录、内容摘要、入口及 requestId 的请求。宿主负责构建、上传和结果，成功结果回传对应 requestId/sourceCommit/digest、固定版本及各入口 URL；失败结果包含 code、message 和 retryable。宿主完整上传后原子发布，重复请求返回同版本，旧版本内容不可覆盖，历史引用版本由宿主负责保留。

register 校验成功结果后更新当前清单及可选 Change 引用；发布失败保留旧引用，不自动转为 Git 兜底。共享仓库锁、事务日志和原文比对保护多文件登记，recover 遇到后续用户编辑会停止；异常退出遗留锁须核实持有进程已结束后处理。协议、调用和恢复细节见[原型协作 skill](../../../../../.agents/skills/spec-trail/prototype/SKILL.md)。

地址使用无凭据、无 query 的 HTTPS，可包含 hash 路由；不保存临时签名 URL、上传密钥或令牌。staged hook 校验暂存配置、引用及 Git 产物；静态校验不能代替浏览器交互验证。

## 总览、详情与二级预览

总览只显示 main 当前清单，提供名称/说明查找、类型与适配筛选和分页；没有多分支来源选择、历史版本列表或迭代时间线。非法单项给出诊断而不遮蔽其他有效入口；停用、未接入、未发布、无匹配和读取失败分别提示。

卡片以截图为主。点击截图进入工作台二级预览，自动收起全局侧栏和来源栏，仅保留顶部路由跳转；主区左侧是可检索原型目录，右侧是画布，窄屏可收起目录。预览不显示 commit 等来源信息。

点击截图以外的卡片区域打开详情抽屉，展示说明、适配、源码路径与提交、main 清单提交、产物位置、托管版本，以及保持原始比例的更大截图；可从详情进入预览。两个操作独立支持键盘，关闭或返回恢复焦点。

设备、方向、适应/100% 缩放及重载集中在画布内。PC Web 为 1440×900、iPad 为 834×1194、移动设备为 390×844 CSS px；组件也可使用声明的固定尺寸。缩放不改变 iframe 布局宽高，设备选项不模拟硬件。

返回总览保留筛选、展开分页、滚动和卡片焦点。预览和详情支持直接链接、刷新及浏览器前进后退；模块或项目切换清理对应上下文。

## 固定链接与归档保留

当前原型分享固定到 main 清单提交，要求该提交属于已推送 main 的历史；总览仍读取最新清单，不提供历史浏览入口。活动 Change 通过自身已推送主来源提交查看和分享进行中的原型，无需先合入 main。

Change 链接固定完整 revision；Git 快照按该提交读取，hosted 使用记录中的固定地址。当前开关、来源可达性和入口范围每次检查。原型归档使用 spec-trail/archive-v2/id 标签保留记录与源码，分支和标签推送并核实后才完成交付。标签缺失或已观察标签被改写会明确报错，不回退最新版；外部托管产物的保留仍由宿主负责。

旧 previews.path 已迁移到 artifact 和 Change 内 HTML 快照，运行时拒绝旧格式。迁移从确定的原交付提交读取字节，不改写旧 Git 历史或旧标签；使用迁移后的新固定链接。新标签 pin 与旧命名空间分开保存，快照升级保留已观察的历史 pin。

## 托管预览与隔离

项目配置 prototypeOrigins 登记精确 HTTPS origin，用于页面和截图引用。服务端不请求远端地址、不代理登录、下载或转发凭据；引用允许来源不是远端资源或重定向的网络防火墙，宿主负责资源策略、版本保留和允许嵌入。

iframe 只授予 allow-scripts，不授予 allow-same-origin，保持 opaque origin。宿主 ESM、动态模块和字体等静态资源须支持无 Cookie 的 CORS，路由使用 hash/memory；不兼容的登录流由用户独立打开宿主页面。宿主响应 CSP 约束其资源和连接，工作台不为兼容而放宽沙箱。

宿主可接入 ready/error 桥接握手，iframe load 不代表应用成功，未确认就绪时工作台显示相应提示。缺失引用、不允许来源、资源或嵌入异常保留明确提示及适用的独立打开入口。

## Git 兜底与离线截图

Git 兜底入口是 UTF-8 自包含 index.html，脚本、样式及 mock 内联，图片/字体用 data URL。不依赖外部 import、动态 chunk、网络、真实后端、持久存储、Worker 或 eval；普通 Vite dist 不等于单文件兜底，宿主负责必要的内联构建。

同域 HTML 同时受 iframe 沙箱和响应头 CSP sandbox 限制，直接导航仍受限；CSP 禁止网络连接、外部资源、嵌套 iframe、表单、对象及 worker。API 不接受 Origin:null，不增加 CORS 或匿名资源通道。HTML 响应 private,no-store，只能按已登记入口和固定提交读取；拒绝任意文件路径、符号链接、LFS、超限或非法产物。无 previews 的 Change 正常显示尚未关联。

可见卡片按需加载截图，默认采用第一个声明设备；设备筛选后截图与交互预览尺寸一致。截图保持比例，加载、失败、重试和预览入口独立。托管截图由宿主提供固定 PNG/WebP 地址，通过允许来源及 no-referrer 加载；缺失时使用占位，OpenFolio 不联网为托管地址截图。

Git 截图在启用 OS 沙箱的独立 Chromium 空白上下文离线生成，不携带登录态或宿主凭据，拦截网络/WebSocket。缓存键包含项目/仓库、HTML 摘要、视口及渲染器版本；命中和 304 仍检查权限、开关、关联及历史引用，生成结束再次检查撤销。

截图在私有目录原子写入，可删除重建；默认总量 100 MiB、闲置 7 天回收、单图 4 MiB，失败短暂退避，相同任务合并。最多两个浏览器并行、24 个排队任务，排队与渲染有时限。响应 private,no-cache,must-revalidate 与 ETag，不放入公共静态目录或 CDN。
