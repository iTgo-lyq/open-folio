# 执行证据

## T1：以静态业务片段替代七组手写原型

### 实际交付

七个 TSX 入口直接引用业务组件；Vite 按清单生成七份自包含 HTML。原型包内 mock 提供仓库、文档、状态、账号、Token、设备、视图和资源，不改业务源码、业务导出或 UI 包。内存浏览器适配隔离存储、剪贴板、history、表单导航和未定义请求。

清除旧 HTML、拼接构建、手写工作台 JS/CSS、专属资源和三个旧 DOM 验证脚本。当前清单保持原 id、设备声明及 artifact，更新入口路径和说明；历史 Change/归档及发布字节未改。新增独立验证脚本、mock 单元测试及包内使用说明。

实现量复核约 1,300 行，按用户自主方案/步骤授权将规模从 medium 调整为 large，补充 Execution 与独立 Review；目标、授权和验收边界不变。

### 检查过程

- `npm run typecheck --workspace prototype`、根 `npm run typecheck` 通过。原型直接引用真实类型，初轮发现并修正 workspace/gitUsername 和集成索引字段。
- `npm run build --workspace prototype` 已生成七份自包含 HTML，并通过既有 htmlIssues 校验。
- `npm test --workspace prototype`：最终 23 项全部通过，含 Token 标识与绑定、分享/仓库检查回归，以及既有截图和 R2 适配器测试。
- `node --conditions=react-server --test tests/prototype-contract.test.ts tests/prototype-publishing.test.ts tests/prototype-tools.test.ts`：16 项通过。
- 初轮完成 56 组默认主题/视口截图；交互检查发现默认“我的”缺少 mock 创建者 subjectId、壳层 100dvh 被评审栏挤出底部，已修正。不会以初轮截图替代修正后的复测。
- 沙箱实测发现没有 allow-forms 时浏览器不触发业务 submit；启动层保持既有 CSP，将提交按钮和 Enter 转发为本地事件。
- `npm run verify --workspace prototype`：最终通过 56 组入口/主题/视口组合、所有声明场景和 11 条交互流程。包含桌面仓库检查、目录与阅读设置、视图取消/保存/看板、详情分享、画布返回、登录/Token、公开旋转、分享内嵌原型；320px 下额外验证 Specs/Change 材料切换、返回焦点、登录按钮提交和公开画布旋转。没有页面异常、异常请求或真实 Storage 调用。
- 标准 `screenshot` 命令逐入口生成 21 张声明设备图片，全部通过图片解码、CSP 和沙箱检查。人工检查桌面暗色阅读、320px Change 列表等截图，确认业务组件与布局正常。
- 独立静态服务器逐一打开七个 `dist/<id>/index.html`，HTTP 200；不使用 iframe 包装时也可渲染、切主题，账号入口可登录虚构账号。每个独立浏览器上下文预存原生 localStorage 探针，操作后仅保留原探针，证实原型未读写真实存储。
- `npx prettier --check` 覆盖新增源码、构建、单元/浏览器验证脚本及包配置，通过；`git diff --check` 通过。根业务 `src` 与 `packages/ui` 无差异。
- 独立评审见 [Review](review.md)，所有发现纳入同一 T1 修正及回归。

### 发布兼容性

在干净提交 `ca86aed` 构建、生成标准图后执行 `prototype prepare`，成功生成 `/tmp/openfolio-prototype-migration-request.json`，包含七个入口和完整产物摘要；没有上传或登记。源码提交随请求固定，临时协议文件不入 Git。原型包既有 R2 单元测试覆盖不可变发布、重试、拒绝覆盖、公开访问校验和缩略图定位，本次全部通过。

逐项比对迁移前清单：七项 artifact 和 devices 完全一致，归档没有改动。`develop` 新增的 favicon 取消记录通过普通 merge 同步，未覆盖其他协作结果。

Draft PR 的 `SpecTrail archive` 检查目前未通过：CI 明确要求 verification、acceptance、Specs 和有效归档。本次按用户要求等待人工验收，缺少 acceptance/归档是预期流程门禁，不绕过，也不将其记为测试通过。

### 交付边界

本次不修改服务实现，不覆盖主工作区 `.next`，不操作持久数据和真实登录；常驻服务无需更新。新产物尚未公开上传，清单 artifact 仍是原固定设计，不是本次构建的线上验证证据。公开上传后还需执行包 README 的缩略图和真实工作台发布验收。

跨域 iframe、真实认证、网络请求与托管握手由 mock 隔离，不宣称得到端到端验证。用户本轮要求停在人工验收；不记录 acceptance，不归档或合入 develop。

### 复现

在本 Change 工作区运行：

```bash
npm ci
npm run typecheck --workspace prototype
npm run build --workspace prototype
npm test --workspace prototype
npm run verify --workspace prototype
python3 -m http.server 10684 --bind 127.0.0.1 --directory packages/prototype/dist
```

本机已通过独立 tmux 会话 `openfolio-prototype-migration` 启动上述静态服务器，仅监听 127.0.0.1:10684；已运行时无需重复启动。它不占用常驻服务的 11117 端口、`.next` 或数据目录。

打开 `http://127.0.0.1:10684/quiet-home/index.html`；其余六个 id 见包 README。无需 `.env`、真实登录或 Token；凭据表单只接受 `demo-lin / demo12345` 和 `demo / demo-work`。截图在 `artifacts/prototype-fragments/`；标准缩略图在各 `dist/<id>/` 中。

## T2：发布七组静态片段并替换旧原型引用

### 公开发布

用户追加授权直接上传制品替换旧原型，不保留旧架构和专属数据。以下发布事实取代 T1 交付时“尚未公开上传”的限制，T1 的实现与验证记录不改写。

在干净提交 `98841e01bb25fb85f2468923c64e35fbe443c19c` 重新执行七入口构建和标准截图，生成 7 个 HTML 与 21 张设备图片。使用主工作区环境配置在内存中注入发布凭据，未复制或输出秘密；既有 `publishToR2` 对 28 个对象完成条件上传、匿名读取、Content-Type 和字节一致性校验。

发布版本为 `3dd6ccb80a617dea779edf058713091bfb5a815e5ee9bb3bf7ce4ed9c34922a8`，摘要为 `sha256:5ec214913a1b347a78ef62037bcaa9bdb8257045fe0fdf555f665d5bd126f4f6`。`prototype register` 同时替换七项当前 artifact 和本 Change previews，所有入口包含 PC Web、iPad、手机三项缩略图。协议请求和结果保存在仓库外的 `/tmp/openfolio-prototype-release-{request,result}.json`。

### 旧数据清理

扫描中心仓库全部 11 个分支 tip；远端无标签。按这些版本的 `docs/project` 与 `packages/prototype` 中固定对象地址核对引用，排除新发布版本后，识别并删除 9 个在当前分支均无引用的旧版本，共 130 个对象、16,457,381 字节。删除响应无错误，并逐版本列举确认对象数为零，没有创建备份。

评审更正（T3）：扫描只覆盖当前分支 tip。其中 6 个版本仍出现在 develop 的历史中间提交里，另有 6 个版本被常驻 OpenFolio 的 16 个旧公开预览版本引用，这些链接现已返回 404。用户确认不考虑历史数据兼容，不恢复、不撤回，也不再另行清理。

删除版本：`0b61fa94`、`176f00ab`、`68649130`、`74d75e67`、`96c1740f`、`bc283d75`、`ccc20ad1`、`e60b41dc`、`f4d4d9ff`。本机清单与删除结果位于 `/tmp/openfolio-prototype-cleanup-report.json`。

`develop` 当前仍引用 `06e078ce` 和 `b79cf450`，其他分支/Change 也有独立固定引用，这些对象未提前删除。旧手写架构、专属 mock 与资源已从本 Change 源码移除，不提供兼容层；未改写历史归档、Git 历史或真实账号及工作台数据。

### 线上验证

- `prototype validate` 与 `prototype validate --browser` 均通过，七项清单及托管页面可用。
- 直接访问 R2 的 21 组入口/设备组合，逐项切换全部声明场景与深色主题；无页面异常、非预期资源请求或原生 Storage 调用。初轮在第十组遇到代理 `ERR_TUNNEL_CONNECTION_FAILED`，保留前九组成功记录；新浏览器重测剩余 12 组全部通过，未调整原型代码或网络策略。
- 通过 `withSmokeSession` 建立独立真实测试会话，刷新 develop 后读取本 Change descriptor：七项均可用并指向新版本。浏览器使用回调提供的 Cookie，逐个打开七个片段并切换主题，另验证 PC Web、iPad、移动设备切换及 Change 分享页。截图位于 `artifacts/prototype-publication/change-{pc-web,ipad,mobile,share}.png`。
- 在该浏览器内加载并解码全部 21 张公开缩略图，均满足 `complete && naturalWidth > 0`。这是图片可用性检查，不冒充默认总览卡片检查。
- 所有真实登录检查都在包装器回调内完成；初次检查异常后亦执行清理，最终完整 smoke 和最新版本号退出复查通过，没有会话清理失败。
- 独立 subagent 复核 T2 的文档、发布请求/结果、实际 dist、七项登记和旧数据删除集合，无明确问题，见 [Review](review.md)。`git diff --check` 通过，业务 `src` 和 `packages/ui` 仍无差异。

日志：`/tmp/openfolio-prototype-release-browser.log`、`/tmp/openfolio-prototype-release-browser-retry.log`、`/tmp/openfolio-prototype-release-change-smoke.log`。构建与截图日志分别为 `/tmp/openfolio-prototype-release-build.log`、`/tmp/openfolio-prototype-release-screenshots.log`。

### 默认总览与验收边界

最初尝试将工作分支作为临时 integrationBranch 检查总览，接口返回空列表及“配置基线缺少有效的 workflow.json 原型配置”。原因是仓库 workflow 明确声明 develop，与工作分支不匹配；没有篡改 workflow、注入假响应或改动服务绕过这个限制。默认 develop 总览仍返回旧七项，这是尚未合入的实际结果，不是新制品发布失败。

本 Change 的在线预览和分享页已使用新制品，可直接验收；默认总览的七项卡片、逐设备图片展示，以及仍由 develop 使用的旧对象清理，需在用户验收并合入后完成。用户本轮仅授权公开上传和旧原型数据清理，未代其记录代码验收、归档或合入；常驻服务实现、运行数据及 `.next` 未改动。

在线入口：[本 Change 的新原型](https://drwulzcazu.merlin-devbox.bytedance.net/share?repository=https%3A%2F%2Fgithub.com%2FiTgo-lyq%2Fopen-folio&change=prototype-architecture-migration&integrationBranch=develop&ct=previews&preview=quiet-home)。复验默认总览时，应在合入后刷新项目，再按原型包 README「发布验收」逐设备检查卡片，不将本次已通过的 Change 画布检查替代该步骤。

## T3：按业务状态还原片段并重新发布七组原型

### 实际交付

评审返修 T1、T2，见 [Review](review.md) R6–R8。删除包内自拟的 `ReadingState`。工作台片段在 `WorkbenchFrame` 中还原 `Workspace` 页面主体的同步失败横幅（重试 / 当前凭据）和首次读取占位“正在打开工作台…”；分享片段还原分享页的“正在读取分享…”、同步失败横幅与“内容不存在或暂不可读”。两处都直接使用业务的 `Shell`、`PublicShell`、`ChangeReading`、`Empty`、`Button` 和对应 CSS Modules，只补写未导出的分支判断。mock 在加载场景和分享空态下不提供快照，其余空态保留连接、只清空数据；“未绑定 Token”空态只用于我的仓库与账号片段，因为业务在无连接时只显示个人页。业务 `src` 与 `packages/ui` 无差异。

### 检查

- `npm run typecheck --workspace prototype` 通过；七入口构建通过 htmlIssues 校验。
- 已合入 develop 最新提交（含 #68），无冲突；合并后根与原型类型检查、构建、包内测试通过。
- `npm test --workspace prototype` 23 项通过；协议测试 `node --conditions=react-server --test tests/prototype-contract.test.ts tests/prototype-publishing.test.ts tests/prototype-tools.test.ts` 16 项通过。Token 绑定用例显式以账号片段的空态开始。
- `npm run verify --workspace prototype`：56 组入口 / 主题 / 视口组合、全部声明场景和 11 条交互流程通过。首轮发现 Changes 空态因移除 Token 停在“正在恢复视图…”，按上述空态语义修正后复测通过。
- 浏览器逐个检查 Changes 空态与失败、Specs 加载与失败、分享加载、失败与空态：显示业务文案和样式，没有页面异常。
- 独立评审（R9）发现 Changes 失败场景连个人视图也失败、列表被替换为请求失败提示，以及分享页缺少通知提示。改为同步失败时个人视图仍可读、分享片段显示业务通知；验证脚本新增断言：阅读片段的失败场景显示失败横幅且保留内容。修正后类型检查、23 项测试与完整浏览器矩阵复测通过。

### 重新发布

在干净提交 `66e3df6` 构建七入口、生成 21 张标准图，`prototype prepare` 后用 R2 适配器上传。发布凭据只在进程内从主工作区 `.env` 加载。新版本为 `612bd014ad580e63d0c4303e87acbec726fe8f32bd1fe37fcef5da8800266ff0`，摘要为 `sha256:ed99cdfb3206ca9db134e89ade754ef038a19efb4ec5c34df5d094c52d920d8b`。R9 修正前曾从 `c1ac187` 发布 `e4583dbc`，该版本的登记未提交，已被本版本取代。`prototype register` 将七项当前 artifact 与本 Change previews 一并替换为新版本。逐个下载 28 个公开对象，与本地产物字节一致；`prototype validate` 与 `prototype validate --browser` 均通过。旧版本 `3dd6ccb8` 与未登记的 `e4583dbc` 不再被引用，按不兼容历史数据的前提保留原样，不另行删除。

构建存在一处不确定输出（R8），不影响发布字节与摘要一致；从同一 sourceCommit 重建不保证得到相同摘要。

合入后核对默认原型总览的七张卡片、逐设备图片及新 Change 原型页，结果记录在 PR 与交付报告中。
