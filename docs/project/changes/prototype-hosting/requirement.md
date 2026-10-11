# OpenFolio 本地原型托管与发布选择

## 背景与目标

现有 hosted 协作要求项目自行提供上传适配器。用户要求 OpenFolio 默认提供静态资源上传和读取服务，产物保存在服务本地文件夹，不接数据库；项目通过 SpecTrail 选择并保存发布方式。

用户进一步明确：静态访问公开，不校验项目权限；管理员取得专用上传地址，持有地址即可上传。地址可以写入项目仓库，仓库成员因此获得上传能力。移除「原型来源」地址配置和来源校验。删除该设置字段属于小型 UI 变化，用户已选择直接删除，不绘制原型。

## 范围与行为变化

`project-knowledge/prototype-preview`：ADDED OpenFolio 内置静态托管，以服务数据目录保存完整多文件产物和发布元数据。无需数据库、对象存储或另一个静态服务。上传完成后提供固定版本地址；服务重启后仍可读取。新版本和重复上传都不覆盖历史版本。

ADDED 管理员取得服务级上传地址；上传地址本身是上传凭据，不要求项目登记、项目邀请码或项目级隔离。持有地址只能上传静态产物，不能读取或修改服务配置。HTML、JS、CSS、图片等发布文件均公开读取。

MODIFIED `docs/project/workflow.json` 可记录 OpenFolio 服务地址，以及原型托管选择：OpenFolio 内置服务、自建静态托管或 Git 单 HTML 兜底。skill 先复用已保存选择；未选择时先询问是否有自建 OpenFolio 服务并记录地址或无服务，再询问发布方式并持久化。选择 OpenFolio 时保存专用上传地址；自建托管保留现有发布适配器协议；Git 使用既有兜底流程。发布失败不擅自更换托管方式。

MODIFIED OpenFolio 方式提供实际上传命令，读取已构建目录并完成上传、结果校验和引用登记。项目仍负责构建，OpenFolio 不执行构建命令或上传文件中的服务端代码。构建产物采用相对资源路径及 hash/memory 路由，可包含多个 HTML、JS、CSS、图片和字体。

MODIFIED 移除设置界面的「原型来源」字段及服务端/客户端的来源白名单、HTTPS-only 和不同源限制，原型与截图可使用任意 HTTP/HTTPS 来源。旧 `prototypeOrigins` 兼容忽略，后续保存配置时移除。iframe 沙箱继续隔离原型脚本；来源开放不改变既有文件路径、上传大小及发布完整性约束。

## 约束与依赖

采用现有单实例、持久磁盘部署。发布文件位于 `OPENFOLIO_DATA_DIR` 下，未指定数据目录时沿用默认目录。历史产物默认保留，备份需包含该目录。本次交付上传、读取接口和 skill/命令，不增加资源管理页面、数据库、删除后台或构建服务。

依赖 `visual-configuration` 的默认数据目录、管理员权限与配置编辑；该 Change 已完成验证但尚待用户验收归档。依赖已归档的 `prototype-ui-rules`，其交付已在本分支可用。按实际状态解除依赖后开始实现，不将讨论新需求视为验收前一项交付。

本次按 medium 组织：扩展共享 workflow/发布契约，联动本地存储、HTTP 接口和 skill 命令，拟分为三项串行交付；不新增资源管理界面。

## 验收标准

- 新旧 workflow 均可读取；三个托管选择及服务地址、上传地址可持久化；已有选择不重复询问，配置操作保留其他 workflow 字段。
- 未登录者无法取得上传地址；持有正确地址者无需项目权限即可上传，错误地址不得写入文件；上传能力不能访问管理接口。
- 多文件产物上传后可匿名访问并运行，重启仍可读取；相同请求可重试，历史固定版本不被替换。
- 上传不完整、摘要不符、超限或路径非法时拒绝发布，不产生可访问的半成品；失败不改变仓库内原型引用。
- skill 引导完成 OpenFolio 发布和登记；自建适配器与 Git 兜底仍可使用，切换方式不改写历史引用。
- 删除来源配置后，旧配置仍能启动和保存；不同 HTTP/HTTPS 来源及同源原型不因来源策略被拒绝；本地托管的模块、样式与图片正常加载，原型脚本无法访问工作台 DOM 或管理凭据。
- 项目现有文档、邀请码及管理权限回归通过，公开静态资源之外的访问权限不变。

## 补充：本项目设计基线与页面外壳

用户于 2026-10-12 明确追加：根据现有产品整理原型包 DESIGN.md，参考主流设计 skill，向 SpecTrail 提供可复用模板和简短指南；移除当前工程的旧测试 demo，只保留一个页面外壳原型。本项目明确采用 Git 直接存储，不调用上传服务。已有归档快照与 Git 历史保持可追溯。

验收：设计规范说明来源、视觉方向、色彩角色、字阶、布局/响应式、组件和交互约定，数值能回溯现有实现；初始化可获得设计模板并保留既有规范；当前清单只含页面外壳，桌面/平板/手机可预览，主要壳层交互可用，资源自包含且无接口请求。该局部追加沿用现有发布契约与 medium 交付安排。

## 协作资源

以下一手资料读取于 2026-10-12，仅参考文档组织和提炼方法，不引入对应平台依赖：

- [Google Stitch extract-design-md](https://github.com/google-labs-code/stitch-skills/blob/main/plugins/stitch-design/skills/extract-design-md/SKILL.md)：从主题、样式和组件抽取设计事实，说明颜色用途与布局规则。
- [Google Stitch design-md](https://github.com/google-labs-code/stitch-skills/blob/main/plugins/stitch-utilities/skills/design-md/SKILL.md)：把视觉描述、具体数值和功能角色结合，形成后续页面可复用的依据。
- [Anthropic frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)：明确用途与视觉方向，再协调字体、色彩、空间及交互。本项目沿用已有雾蓝工作台风格。
