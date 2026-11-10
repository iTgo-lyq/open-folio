# 为含子模块的来源 worktree 提供清理指引

合入后的来源 worktree 含 `repos/experiment_fe` 一类已初始化子模块时，Git 会拒绝非强制移除。即使执行 `git submodule deinit`，残留的 `modules/` 仍可能触发同一限制。现有流程在远端源分支删除后才报告 Git 失败，缺少后续处理指引。

## 方案与验收

- `cleanup` 在删除前识别已检出子模块或来源 worktree 的 `modules/` 目录。保留来源，在逐对象结果中报告具体路径、原因及下一步。仅含未初始化 gitlink 的干净 worktree 可继续常规清理。
- SpecTrail 说明如何核实子模块和嵌套子模块的本地提交、stash、文件及其他 worktree 依赖。核对通过并取得用户明确确认后，人工移除指定 worktree，再重跑 `cleanup` 完成分支清理。
- 使用临时 Git 仓库覆盖初始化、反初始化后残留数据、未初始化 gitlink 和人工移除后重试，核对两个分支引用在预检拦截时保留。
