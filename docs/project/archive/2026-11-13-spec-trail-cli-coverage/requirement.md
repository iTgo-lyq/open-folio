# 补齐 SpecTrail 日常状态命令与提交前校验

## 目标

SpecTrail 要求 Agent 通过状态命令维护 `change.json`，脚本无法满足时才走手动逃生通道，每次手改都要用户二次确认。目前有五类 skill 明确要求的日常操作没有对应命令，只能手改；另有几条约束只写在 skill 正文里，靠 Agent 自觉遵守，违反后要到执行时才暴露，甚至不暴露。

本次让这些日常操作都能用命令完成，并把约束前移到命令执行和提交前校验，越早发现越好，使 skill 正文不必再写这些约束（需求 Q1）。

## 现状

| skill 的要求 | 当前命令能力 |
| --- | --- |
| 规模随证据校准，更新 `size` 并对齐阶段 | 没有修改 `size` 的命令 |
| 调整依赖时同步用途说明 | `dependsOn` 只能在 `create` 时设置 |
| xlarge 调整拆分时同步 `children` | `children` 只能在 `create` 时设置 |
| 任务冻结前可以修改、拆分、删除 | 只有 `task-add` |
| 使用任务分支时把任务设为 doing 并填写 `branch` | 只有新建任务时可带 `--branch` |

已知未被强制的约束：子 Change 可以把父 Change 写进 `dependsOn`，之后双方互相等待关闭；`task-add` 显式指定比现有最大编号更小的编号也能成功，默认执行顺序随之改变，自动分配也只看当前任务，删掉最大编号后会再次分配它；协作者 `name` 写入邮箱可以通过校验；skill 脚本零第三方依赖只靠维护者自觉。

## 范围

- **新增状态命令（需求 Q2）**　均只作用于 active Change，沿用现有命令的所属分支、`--dry-run` 与帮助约定，并补充命令说明。
  - `resize`：在 small、medium、large 之间调整规模（需求 Q3）。升级后回到新规模下最早缺少必需确认的阶段，保留已完成任务和仍有效的确认，例如 small 在执行中升为 medium 后回到 requirement，可依次补齐需求、技术与计划确认后继续执行。降级不撤销已有确认，仅在当前阶段对新规模不成立时调整，例如 large 在 plan 阶段降为 medium 后回到 technical。不支持改为或改出 xlarge，拆分仍按父子 Change 规则处理。
  - `depends`：替换或清空 `dependsOn`；xlarge 不声明依赖。
  - `children`：替换 xlarge 父项的 `children`。
  - `task-update`：修改尚未提交为 done 的任务标题或任务分支。
  - `task-remove`：删除尚未提交为 done 的任务。
- **前移的校验（需求 Q1）**
  - 子 Change 的 `dependsOn` 不得包含其 `parent`；协作者 `name` 不得包含邮箱。两条由共享状态校验拒绝，命令、pre-commit、PR 检查和工作台的协作者输入同时生效。
  - `task-add` 分配或接受的编号必须大于本 Change 出现过的最大任务编号，包括当前任务和已提交历史中的任务，已删除的编号不再分配。只在本地删除、从未提交的编号不受此限制。
  - 提交中包含 skill 自身的脚本时，pre-commit 检查这些脚本只引用相对路径或 `node:` 内置模块；未涉及 skill 脚本的提交不做这项检查。
- **兼容**　仓库现有 117 条 Change 记录均不违反新增的状态校验，无需迁移。工作台共用状态校验，合入后更新常驻服务。
- **不在范围**　不在 pre-commit 中对比任务编号的前后变化；不修改 `SKILL.md` 正文。

## 验收

- 五个新命令出现在总帮助和命令帮助中，参数说明与示例可直接运行，`--dry-run` 不写入文件。
- `resize`：small 在 execution 阶段升为 medium 后回到 requirement，已完成任务保留，依次记录需求、技术、计划确认后可再次 `execute`；large 在 plan 阶段降为 medium 后回到 technical，已有确认保留；改为或改出 xlarge 被拒绝。
- `depends`、`children` 按传入值替换；xlarge 声明依赖、非 xlarge 设置子项均被拒绝。
- `task-update`、`task-remove` 对尚未提交为 done 的任务生效，对已提交为 done 的任务被拒绝。
- 子项依赖父项、协作者 `name` 含邮箱时，`create`、对应的修改命令和 pre-commit 均拒绝；工作台的协作者输入同样拒绝。
- 已提交 T1–T3 后删除 T3 并提交，`task-add` 省略编号时分配 T4，显式指定 T3 或不大于最大编号的编号均被拒绝。
- 提交的 skill 脚本引入第三方包时 pre-commit 拒绝；只修改其他文件的提交不受影响。
- 现有测试全部通过，仓库现有 Change 记录在新校验下全部有效。
