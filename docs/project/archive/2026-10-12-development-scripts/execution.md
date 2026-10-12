# 开发工具交付证据

## T1：开发服务与原型截图

服务命令由 `scripts/service.mjs` 提供，npm 入口为 `service:start`、`service:stop`、`service:status`、`service:update`。使用当前 Node.js 可执行文件及项目位置，从 Next.js 标准环境配置读取设置；tmux 托管独立监督进程，进程退出后重启。更新操作持有本项目锁，先停止服务并等待端口释放，再构建 `.next`。识别当前 tmux 监督进程，拒绝接管其他进程的端口或会话，修改会话前必须先停原服务。构建失败保持停止，不创建回滚快照，也不处理运行数据。

原型包的 `screenshot` 命令读取自包含 HTML，复用产品设备尺寸及 SpecTrail 的 HTML 检查和 CSP。默认在入口旁生成三张标准 PNG，也接受设备列表、自定义视口及输出目录；OS 沙箱保持启用，通过不透明 iframe 渲染。现有 R2 发布器保持不变。

补充根 `.env.example`、README 和 AGENTS.md；真实凭据仅放未提交的本地环境文件，没有配置真实工作台 Token，也未通过真实 Token 登录验证。类型检查排除 `artifacts` 与 `.openfolio`，临时目录只承载生成内容。

### 验证

- `node --conditions=react-server --test tests/service-tools.test.ts`：1 项集成测试通过。临时项目从仓库外调用脚本，验证启动、重复启动、停止、再次更新、配置切换保护、操作锁与失效锁恢复、端口占用保护、构建失败，以及工作台哨兵文件和凭据不泄漏。
- `npm test --workspace prototype`：11 项通过，包含原有 R2 发布验证及截图集成测试；覆盖标准设备、自定义视口、沙箱存储隔离、无效参数、外部资源拒绝和页面脚本错误。
- `npm run build --workspace prototype`：导出三个原型。实际 token-workspaces 原型生成 1440×900、834×1194、390×844 图片，workspace-shell 生成 320×720 自定义图片，查看手机图片确认内容正常。
- `npm run typecheck`、项目原有 `format:check`、新增脚本与文档的 Prettier 检查及 `git diff --check` 通过。清理测试构建后再次类型检查通过，生成的类型引用仍指向存在的 `.next/types` 文件。
- 停止已核实的旧临时启动进程后运行 `npm run service:update`：构建和启动成功，运行来源为实现提交 `71a355c`，无未提交的跟踪文件改动。保留迁移模块已有的三条动态文件追踪警告，产品代码未改变。
- `service:start` 重复调用保持同一监督进程；`service:status` 返回 running。`GET /` 与 `GET /api/session` 均为 200。真实运行页面在 390×844 视口打开登录表单，Token 输入可见，用户名可选，没有页面脚本错误或横向溢出。

### 清理与数据保留

删除旧启动脚本、绑定特定原型或失效 API 的临时脚本，以及 artifacts、闲置 `.next-e2e`、test-results、原型和 UI 的 dist。检查 `/proc` 中的进程引用后，清理 124 个已停止的测试夹具目录及相关临时协议、图片和日志；合计 146 个清理目标，释放约 650.5 MiB。本次生成的截图与测试缓存也已清理。

保留运行中的 `.next` 和现有数据目录。更新前后对数据文件名及文件内容做聚合 SHA-256 校验，排除运行日志与锁文件，结果完全一致。`.openfolio` 最终只保留构建版本、运行版本和服务日志，未产生备份目录或遗留操作锁。历史 Change、Git 标签、R2 已发布版本均未删除。

### 自查

对照需求核对命令入口、停止后构建顺序、会话和端口占用保护、数据保留、截图沙箱与错误清理，以及模板和日志不输出秘密；没有未解决的验收项。属于两个本地工具职责，不改变产品契约，按 small 自查与自验收关闭。
