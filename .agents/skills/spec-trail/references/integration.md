# Change PR 集成与清理

Plan 在工作分支写完并推送后，通过平台工具创建或复用同仓库 Draft PR，目标为 integrationBranch，不等待计划确认。small 无 Plan，在移交并推送真实执行状态后、实施前创建。正文说明范围，末尾独立段落写：

```text
SpecTrail-Change: example
```

按仓库、源目标分支和标记匹配已有 PR；有歧义先核实。后续推送同一源分支自动更新 diff，交付时更新同一 PR 的标题、说明与验证证据。未归档时归档 CI 失败是预期门禁，不绕过。

归档前同步集成分支、解决冲突并验证；归档推送后执行：

```bash
node .agents/skills/spec-trail/scripts/integration.mjs preflight --change example
```

预检只定向获取引用并检查，输出源 SHA、目标和合并消息。通过后将已有 Draft 转为可审阅；缺失时补建。未归档不得合入，已接入的归档 CI 须通过。按已有授权普通 merge，并传入预期源 SHA；合并消息末尾保留同一标记。源或目标推进后重新预检并核对 CI 与受影响验证。只允许 squash/rebase 或无法保留消息时报告受阻，不回退直推。

合入响应未知、排队或受理时先查平台 PR 状态与远端 Git，不能据此宣称成功。verify 独立检查当前本地/远端来源 tip 是否均已纳入远端集成历史，不依赖 Change 标记、第一父位置或差异索引：

```bash
node .agents/skills/spec-trail/scripts/integration.mjs verify --change example
```

verify 返回 integrationBranch、tip、source（branch / remote / local）、sourceIncluded 与 sourceAbsent。sourceIncluded=true 表示当前来源提交已纳入；false 时命令失败并保留来源。来源引用均已删除时 sourceAbsent=true、sourceIncluded=null，表示已无来源可比较，不代替平台 PR 的合入事实。

工作台通过普通 Git 合并历史及唯一 Change 标记定位 M，差异固定为 M^1 到 M；该定位失败或存在歧义只影响差异展示。已合并 PR 的合并提交属于目标历史时，合入事实仍成立。归档完整性在合入前 CI 检查，合入后不重演归档交付校验。

## 返修

归档尚未集成时，先核实 PR 未合入、取消已有自动合并并按需转为 Draft，再用 `change.mjs rework --stage execution --reason ... --approach ...` 恢复原 Change，追加返修任务。命令刷新集中入口并检查来源是否已纳入目标，移回文档并恢复原型路径；已完成任务保留，关闭记录清除。重新交付前复查远端与源 SHA。

已集成、路由冲突、无标记合入或历史不可读均不自动恢复；本地锁不能阻止远端并发合并。已集成后的修正建立新 Change。

## 清理

核实远端目标已包含来源后，在干净的主工作区安全快进集成分支，按项目约定更新服务并验证原型/产物。移出待删 worktree，确认其客户端会话、后台任务和服务不再写入，再执行：

```bash
node .agents/skills/spec-trail/scripts/integration.mjs cleanup --repo /path/to/primary --change example --verified-commit <已验证的交付提交> --idle-worktree /path/to/source
```

`--verified-commit` 是 Agent 已完成交付/服务及产物验证的实际 Git 提交，可以是 PR 合并或后续提交；它须属于当前远端集成历史，当前工作区包含它，所有待删来源 tip 已纳入它。`--idle-worktree` 记录实际占用核对，不是新增用户审批；无 source worktree 时可省略。清理独立检查归属、依赖、待删 tip、Git 操作和文件/占用状态，不要求定位 M 或复验归档子树；不能判定安全时保留来源。

未提交、未跟踪或忽略文件会阻止脚本直接删除；assume-unchanged / skip-worktree 标记须先解除并检查文件。无保留价值的来源 worktree 默认删除，无需再确认：主动清除可重建依赖、构建产物、无用临时文件及已核实有副本的配置，再重试，不例行备份、不强制绕过检查。主工作区、协作/发布分支及其他 active/cancelled 入口依赖不能删除。

若因独有成果、配置、数据、占用或无法核实安全性而决定保留，简述具体原因并询问用户是否保留；答复前暂留。用户选择删除时，按授权保存或丢弃相关内容，再完成清理。

顺序为远端源分支 → worktree → 本地源分支。远端按预期 tip 条件删除，本地使用已合并检查和非强制 worktree 删除。结果逐对象标为 cleaned/retained/failed；退出码 2 表示清理遗留，合入事实仍成立。相同命令可继续清理，不重复生成 M，已不存在对象视作完成。
