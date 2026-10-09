# T1：默认串行及显式顺序统一校验

无执行顺序表时，共享任务图按编号数值顺序建立串行链；显式表覆盖默认安排。流程命令和工作台均调用同一模块，任务开始和完成检查全部前置链，执行及关闭步骤重新读取安排。

工作台区分默认与显式来源；无表的普通 Plan 不再产生来源提示。small 归档记录同样拒绝无效的显式安排，但无需额外创建 Plan。xlarge 保留子 Change 路线。未修改提交 hook 或 change.json 字段。

# 验证证据

- `npm test`：54 项通过，覆盖解析、真实临时 Git 仓库语义命令、失败无写入，以及既有读取/原型行为。
- `npm run typecheck`：通过。
- `npx playwright test tests/browser/changes.spec.ts`：12 项通过，覆盖无表 Plan 的概览无来源提示、任务来源展示及显式安排展示。
- `OPENFOLIO_BUILD_DIR=.next-order npm run build`：生产构建通过。独立构建目录用于保留本地预览的旧构建，构建生成的 tsconfig 路径不属于交付改动。
- 主 skill 的 `quick_validate.py` 校验和 `git diff --check` 通过。

Markdown 回归覆盖数字编号、文字 Plan、显式并行、缺表/损坏表/循环、代码/引用/列表/HTML 示例，以及列表后的顶层缩进表、自动链接、同行与跨行 HTML、引用式链接、表后标题。完成记录与前置链回归覆盖 small/medium/large 和既有状态不一致的历史输入。

本地工作台原先运行旧生产构建。更新本地预览并保留原配置与数据目录后刷新采集；在快照 `4eee2dcf-0513-40fa-aeaf-4f53539a16f4` 中，截图里的 `spec-trail-setup-check` 已是 valid/default、T1 无前置、无顺序诊断。浏览器实际核对概览无“来源提示”和“来源需要核对”，任务页显示默认串行；原 Change 的 Plan 与验收记录未修改。

# 独立评审

隔离上下文 Agent 评审整个差异，发现列表缩进、HTML 上下文、引用式链接及表后包含竖线的标题兼容问题；已修复并加入回归，最终复验结论见 [Review](./review.md)。

# 验收与后续

本 Change 为 medium，等待用户验收。验收后更新 Change 工作流和 Change 读取的 Specs，再归档；当前未同步 Specs，未合入 main。此前 setup 检查 Change 保留在原分支，不改写其完成任务或验收记录。
