# 静态业务片段迁移

依据 [Requirement](requirement.md)。本次交付的是原型包本身，不新增产品视觉方案，也不修改业务组件接口；七个入口复用当前已实现界面，最终原型与代码一起交用户验收。

## 实现

保留七个 `quiet-*` id、设备声明及独立地址，入口改为包内 TSX。每个入口只组合相应业务片段，不启动 `Workspace`、Next 服务端、真实登录或应用路由：

| 入口 | 直接复用 | 原型上下文 |
| --- | --- | --- |
| quiet-home | Shell、PersonalHome | 仓库列表、侧栏与账号菜单 |
| quiet-specs | Specs、Reader、ReadingDocument | 能力目录、正文、相关 Change |
| quiet-changes | Changes、ChangeDirectory、ChangeReading、ChangeViewsProvider | 列表、视图管理、详情和材料 |
| quiet-prototypes | Prototypes、ChangePreviews | 卡片、详情、设备画布 |
| quiet-credentials | AccountSettings、AccountLogin | 登录/注册表单、Token、设备 |
| quiet-public | PublicPreviewView、PublicPreviewUnavailable | 匿名画布与不可用状态 |
| quiet-share | PublicShell、ChangeReading | 匿名只读材料与内嵌原型 |

不为原型新增业务导出、预览 props 或组件库。源码路径直接引用 `src/components`；共享基础组件仍通过既有 `@open-folio/ui` 包入口使用。样式导入业务全局 CSS、UI token 和组件 CSS Modules，不保留第二套手写工作台样式。

## 数据与副作用

Vite 在原型构建中替换 context、personal-context、api、PrototypeFrame 等数据/资源边界。类型引用仍取真实模块，mock 提供虚构仓库、人员、文档、预览与账号；未知请求明确报错，不回退到真实服务。请求和 Token 操作只修改内存，刷新恢复初始数据。

既有组件中的直接 localStorage/sessionStorage 调用由原型启动层的内存 Storage 替代；公开画布直接操作 history 的行为同样在原型内隔离。嵌套预览使用包内虚构页面的 srcDoc、缩略图使用 data URL，不加载真实原型或第三方资源。构建拒绝服务端/Node 模块进入客户端。业务源码及持久数据格式不变。

每个入口提供轻量评审栏，切换主题与适用场景，并注明 mock 和复用组件。场景变化重置该片段的内存状态，不实现跨入口应用导航。壳层导航仅演示选择，不拼装完整工作台。

## 构建与兼容

沿用 `packages/ui` 已采用的 Vite 版本与 React 技术栈，配置只放原型包。`npm run build --workspace prototype` 以清单为入口，分别打包 IIFE、CSS 和资源并内联为 `dist/<id>/index.html`，不需要 dev server、Next 或后端。每个入口自包含，沿用现有不透明 iframe、CSP、截图与 R2 发布协议。

当前清单更新标题、说明与 sourcePath；未发布前保留旧 artifact，明确它仍是历史设计而非新构建。旧 Change、归档、固定 URL 和已发布字节不变。新产物只有实际发布验证成功才登记。用户本轮授权实现、验证、提交推送，发布到公共 R2 的外部写入另行确认；本次先验证 prepare 与适配器契约，不虚报线上新版本。

## 取舍与冗余审核

- 保留：自包含产物、既有安全校验和固定版本发布，保护不透明 iframe 加载及历史引用。
- 合并：七组重复 UI 改为业务源码复用，mock 集中在少数边界，不复制展示逻辑。
- 删除：过时 HTML 模板、工作台 JS/CSS 和绑定旧 DOM 的验证脚本，替换为真实业务组件交互检查。
- 延后：产品架构重构、多页应用路由、新的状态管理框架与生产数据迁移；本次均无必要。

## 验证路径

类型检查保证 fixture 与现有组件契约一致；构建/单元测试验证七个入口、静态校验、mock 请求和发布契约；Playwright 通过现有截图设施的沙箱/CSP 打开七个入口，覆盖明暗主题、声明设备及 320px，操作列表/详情、目录、视图、账号表单和画布。监测请求、存储与异常，确认没有真实接口访问。独立评审核对需求、整个差异和检查证据。

本次不修改服务实现、不构建或覆盖常驻 `.next`，因此无需更新常驻应用服务。构建后的片段可用任意静态服务器验收；若环境无法运行，按 Requirement 记录检查、未验证项和复现步骤后仍提交推送。
