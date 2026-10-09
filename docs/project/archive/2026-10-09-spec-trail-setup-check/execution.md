# T1 验证证据

自动安装入口已替换为只读 `check-setup.mjs`；输出环境、资源、配置和调用命令，hook 始终标记为未验证。setup skill 与主 skill 入口说明已对齐；业务方在项目维护的入口中接入校验并验收。本仓库既有 `.githooks/pre-commit` 继续调用同一校验器。

- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：10 项通过。临时仓库中的完整文件与权限快照确认检查无副作用；覆盖缺失/损坏资源、无效配置、原生和自定义 hook、全局及空配置、委托入口重新生成、真实提交失败传播、clone、worktree 和部分提交。
- `npm test`：48 项通过，包含共享字段、状态命令、暂存原型契约及工作台回归。
- `skill-creator/scripts/quick_validate.py`：主 skill 与 setup skill 均通过。
- `git diff --cached --check`：通过。
- 本仓库运行 `check-setup.mjs`：资源及 workflow 准备就绪；hook 输出 `unverified`。规划检查点提交经现有 hook 校验通过；无效提交路径在隔离仓库中验证，未污染本工作区或暂存区。

本次没有改变 UI、服务端业务代码或依赖，未运行 Next.js 构建和浏览器端到端测试。

# 独立评审修正

独立 Agent 在隔离仓库中复现：原型共享模块仅导出 `entryPath` 时，准备检查可能误报就绪，而合法的 `previews: []` Change 会在实际校验中失败。检查已补齐 `validatePrototype` 与 `validatePreviews` 导出要求；回归同时验证缺失时 setup 失败、真实校验失败，以及恢复完整模块后同一合法暂存状态通过。

修正后 setup 全部 10 项再次通过；独立 Agent 对修正做定向复验通过，结合完整差异评审未发现其他需修正问题。
