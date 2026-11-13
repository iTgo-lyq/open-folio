# 实现与验收记录

| 任务 | 验证结果 |
| --- | --- |
| T1 | Git 夹具验证任务标题、分支设置及清除、删除和 dry-run。删除已提交的 T3 后自动分配 T4，显式 T3 被拒绝。提交前撤销的编号仍可分配，已提交完成的任务不可编辑。 |
| T2 | small 升为 medium 后保留已完成任务，补录三项确认后继续执行。large 降为 medium 保留原确认并回到 technical，xlarge 互转被拒绝。 |
| T3 | 命令可更新依赖与子项，拒绝错误规模和子项依赖父项。CLI、暂存校验和 PR 检查拒绝含邮箱的补充协作者。工作台读取测试验证诊断及 Git 成员保留。仓库现有 118 条 Change 记录均通过共享校验。 |
| T4 | 真实 Git 提交验证常规暂存、部分提交、直接第三方引用拒绝及相对路径、内置模块放行。原型工具 6 项测试通过，含从项目加载 Playwright 的浏览器验证。 |
| T5、T6 | 独立评审复验了归档恢复后的任务保护、small 升级后的重新验收、跨合并提交的历史编号，以及直接引用扫描。39 个现有 Skill 脚本通过扫描。 |

## 整体验证

- `npm test` 通过 479 项，`npm run typecheck` 通过。
- `node --test .agents/skills/spec-trail/tests/*.test.mjs .agents/skills/spec-trail/setup/tests/setup.test.mjs` 通过 43 项。
- `npm run build` 通过。隔离数据目录下启动生产构建，首页和匿名 `/api/session` 均返回 HTTP 200，测试进程已停止。
- 独立评审通过。提交检查使用词法扫描，覆盖常见的直接模块引用。运行时拼接路径、加载函数别名及完整 JavaScript 作用域分析超出覆盖范围。

## 人工验收

在本 Change 工作区运行 `node .agents/skills/spec-trail/cli.mjs change --help` 查看五个新增入口。运行 `node --test --test-name-pattern='task editing|task numbering|resizing|acceptance recorded|relationship commands|collaborator commands' tests/state-commands.test.ts` 复验状态行为。运行 `node --test --test-name-pattern='direct module dependencies' .agents/skills/spec-trail/setup/tests/setup.test.mjs` 复验真实 Git 提交。测试自行创建隔离 Git 仓库。
