# 执行与验证

## T1：实现并验证已移交 Change 的集成分支提交拦截

在现有 pre-commit 中增加约 50 行本地检查，按实际提交路径定位 Change，以 HEAD 的 active 状态和独立分支登记判定归属；报错提供分支与本地 worktree，工作区不在本地时给出 locate 命令。删除和重命名同样检查，集中规划阶段及本次改写 branch 不影响判断。不查询远端，不修改文件或暂存区。

保留规划与首次分支登记、工作和任务分支、正常合并及不涉及 Change 文档的提交。部分提交沿用 Git 提供的 GIT_INDEX_FILE。同步工作区和 Setup 说明，应用与技能版本统一为 0.1.4。

验证结果：

- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：23 项通过，包括真实 Git hook 对正文、状态、增删、重命名及改回 branch 的拒绝；失败后 HEAD 和暂存内容保持不变；中文含空格 worktree 提示、无本地 worktree 的 locate 提示、自定义集成分支、部分提交、规划与首次登记、工作/任务分支、detached 子项登记和正常合并放行。原有状态结构、clone、worktree 和 hook 接入测试同样通过。
- `node --conditions=react-server --test tests/workspace-routing.test.ts tests/xlarge-integration.test.ts`：20 项通过，覆盖普通和父子移交、失败恢复、归属、依赖、集成及清理。
- `node --test .agents/skills/spec-trail/tests/version.test.mjs`：2 项通过；另核对 package.json、package-lock.json 根及根包、技能 version.json 均为 0.1.4。
- Setup 检查输出 readiness=ready；`git diff --check` 与 hook 语法检查通过。

Agent 自查完整差异及需求验收，无遗留问题。全部新增提交验证使用临时仓库，不写入用户工作区或共享暂存区。实现不涉及页面或运行服务代码，不需要浏览器验收。按已确认范围，未同步 Change 文档的实现提交仍放行；这是有意保留的识别边界。
