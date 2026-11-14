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

扫描中心仓库全部 11 个分支 tip；远端无标签。按这些版本的 `docs/project` 与 `packages/prototype` 中固定对象地址核对引用，排除新发布版本后，识别并删除 9 个无有效引用的旧版本，共 130 个对象、16,457,381 字节。删除响应无错误，并逐版本列举确认对象数为零，没有创建备份。

删除版本：`0b61fa94`、`176f00ab`、`68649130`、`74d75e67`、`96c1740f`、`bc283d75`、`ccc20ad1`、`e60b41dc`、`f4d4d9ff`。本机清单与删除结果位于 `/tmp/openfolio-prototype-cleanup-report.json`。

`develop` 当前仍引用 `06e078ce` 和 `b79cf450`，其他分支/Change 也有独立固定引用，这些对象未提前删除。旧手写架构、专属 mock 与资源已从本 Change 源码移除，不提供兼容层；未改写历史归档、Git 历史或真实账号及工作台数据。
