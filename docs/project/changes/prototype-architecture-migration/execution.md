# 执行证据

## T1：以静态业务片段替代七组手写原型

### 实际交付

七个 TSX 入口直接引用业务组件；Vite 按清单生成七份自包含 HTML。原型包内 mock 提供仓库、文档、状态、账号、Token、设备、视图和资源，不改业务源码、业务导出或 UI 包。内存浏览器适配隔离存储、剪贴板、history、表单导航和未定义请求。

清除旧 HTML、拼接构建、手写工作台 JS/CSS、专属资源和三个旧 DOM 验证脚本。当前清单保持原 id、设备声明及 artifact，更新入口路径和说明；历史 Change/归档及发布字节未改。新增独立验证脚本、mock 单元测试及包内使用说明。

实现量复核约 1,300 行，按用户自主方案/步骤授权将规模从 medium 调整为 large，补充 Execution 与独立 Review；目标、授权和验收边界不变。

### 检查过程

- `npm run typecheck --workspace prototype`、根 `npm run typecheck` 通过。原型直接引用真实类型，初轮发现并修正 workspace/gitUsername 和集成索引字段。
- `npm run build --workspace prototype` 已生成七份自包含 HTML，并通过既有 htmlIssues 校验。
- 初轮包内 21 项测试通过；后续针对独立评审追加 Token 标识与绑定、分享和仓库检查回归。
- `node --conditions=react-server --test tests/prototype-contract.test.ts tests/prototype-publishing.test.ts tests/prototype-tools.test.ts`：16 项通过。
- 初轮完成 56 组默认主题/视口截图；交互检查发现默认“我的”缺少 mock 创建者 subjectId、壳层 100dvh 被评审栏挤出底部，已修正。不会以初轮截图替代修正后的复测。
- 沙箱实测发现没有 allow-forms 时浏览器不触发业务 submit；启动层保持既有 CSP，将提交按钮和 Enter 转发为本地事件。七项桌面交互复测通过，正在补充窄屏操作、具体场景断言和最终矩阵。
- 独立评审见 [Review](review.md)，所有发现纳入同一 T1 修正及回归。

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

打开 `http://127.0.0.1:10684/quiet-home/index.html`；其余六个 id 见包 README。无需 `.env`、登录或 Token；凭据表单只接受 `demo-lin / demo12345` 和 `demo / demo-work`。截图在 `artifacts/prototype-fragments/`；标准缩略图使用包内 screenshot 命令。
