# 实施与验证

执行工作区为 Codex 创建并附加到本聊天的 `/home/tiger/.codex/worktrees/change-labels-urgency/open-folio`，分支为 `codex/change-labels-urgency`。已核对 cwd、分支及共享 Git 目录，使用该明确路径执行；主工作区保持 develop。采用客户端托管路径以保留聊天与工作树关联。

## T1

增加可选 `types` 与 `urgency`，创建命令和 `labels` 支持独立更新、类型规范化及恢复默认普通。共享校验供命令、hook 和工作台读取复用；错误可选字段单独警告，不撤销合法完成事实。缓存版本递增，旧解析快照按现有机制重建。

skill 正文仅增加两个字段和一段标注指引；状态命令表增加参数与 labels 一行，不增加流程或配套文档。

验证：

- `node --conditions=react-server --test tests/state-commands.test.ts tests/changes.test.ts tests/incremental-cache.test.ts`：39 项通过，覆盖命令、兼容读取、错误隔离、完成依赖与缓存重建。
- `npm run typecheck`：应用及 UI 包通过。
- `skill-creator/scripts/quick_validate.py .agents/skills/spec-trail`：通过。

测试通过临时 Git 仓库完成写入、推送和读取；没有修改历史归档或运行数据。
