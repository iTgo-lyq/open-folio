# 调查依据与讨论结论

## 代码基线

2026-10-18 fetch 后检查：默认分支 `main`，基线提交 `9d6c582ce66def35ebc59237f99af9c2e438b295`。当时仅有主工作区、没有未归档 Change；本 Change 随后按现行规则建立在独立 `change/central-change-routing` 分支中。这是当前环境事实，不能用于推定未来切换时仍没有并行工作。

| 已核对的现状 | 证据 | 对本方案的影响 |
| --- | --- | --- |
| skill 默认每个 Change 一条分支，JSON 只在所属分支更新；同分支只允许一个普通执行/关闭 Change | [主 skill](../../../../.agents/skills/spec-trail/SKILL.md) | 集中规划、执行移交及规划父项需要显式调整规则，不能只改提示词。 |
| 状态命令从当前工作树枚举 records，要求 `state.branch` 等于当前分支；JSON 写入使用 common-dir 锁 | [change.mjs](../../../../.agents/skills/spec-trail/scripts/change.mjs) | 需要跨来源定位与专用移交语义；既有锁不覆盖 Markdown 编辑和 Git 发布全过程。 |
| WorkflowConfig 与 ChangeState 的 schemaVersion 均严格为 1；CLI/hook 共用校验，后台另有 Zod 定义并复用澄清与原型校验 | [state-schema.mjs](../../../../.agents/skills/spec-trail/scripts/state-schema.mjs)、[server/schema.ts](../../../../src/server/schema.ts) | 新配置与 branch 定位规则要统一维护；ChangeState 沿用现有结构。 |
| hook 校验暂存区 workflow/change JSON，另有原型跨文件检查 | [pre-commit.js](../../../../.agents/skills/spec-trail/setup/scripts/pre-commit.js) | 保持完整 JSON 结构校验，来源相关语义先判断 branch 归属；集中副本与目标副本并存不构成互斥错误，远端条件由命令核对。 |
| GitReader 查询全量 heads 与 archive-v2 tags，宽泛 fetch；默认分支扫 docs/project，其余分支扫 changes/archive | [git.ts](../../../../src/server/git.ts) | 定向读取要同时改变发现、拉取与正文来源；仅过滤列表不能减少收集成本。 |
| 未变化分支复用文档，blob 内容按 SHA 去重；来源语义由 scanFingerprint 区分 | [git.ts](../../../../src/server/git.ts) | 保留增量能力，新增引用目标提交清单；集中分支未变不能成为跳过目标查询的条件。 |
| 接入探测查询全部 heads，并检查默认分支、守护分支存在性 | [discovery.ts](../../../../src/server/discovery.ts) | 新模式的接入探测也必须改成配置后定向查询。 |
| Change 索引聚合所有分支候选，选唯一 `owner === branch`，特殊情况下使用归档保留标签 | [changes.ts](../../../../src/server/changes.ts) | 必须由显式入口决定来源，避免移交准备副本被当成第二主记录。 |
| Specs 与原型配置取默认守护分支，固定原型可用保留来源 | [indexer.ts](../../../../src/server/indexer.ts)、[previews.ts](../../../../src/server/previews.ts) | 协作分支不能替代交付基线或改变历史原型引用语义。 |

上述是代码阅读结论；本轮未实施新模式，也未做移交、故障恢复或新会话绑定实验。

## iclaude 讨论

用户要求使用不预设方案倾向的提示词讨论。2026-10-17 使用本机 iclaude 进行了三轮，讨论会话标识为 `0d701f7c-6964-4392-b4b0-631644504c2a`；本轮复读后将可持续结论整理如下，不依赖本机临时输出作为续接前提。

第一轮偏向维持每 Change 分支并增加发现能力。第二轮区分了早期可见、跨 Change 规划、找到工作分支、后台少扫四个诉求。用户补充“主工作区固定用于讨论，其余工作区推进”后，第三轮有条件支持集中规划与工作分支执行，强调移交、会话位置、共享 index 与服务资源仍需额外机制。

采纳的讨论结论：固定入口能减少从会话历史寻找分支的依赖；集中目录能保存执行入口；文件隔离不等于无并发冲突；状态和执行代码仍应留在目标分支；迁移与失败恢复必须有确定读法。

本方案明确修正或不采用的建议：

- 用户明确要求复用 `change.json.branch`。集中副本可保留旧 stage/tasks 和正文，读取端沿 branch 找权威记录，不将旧字段作为当前状态；不新建引用文件、不清空目录或增加格式替换提交。
- 不以全分支扫描作为新模式运行时兜底；只在显式旧模式和一次性迁移中使用。
- 不把本机未提交状态排在已推送状态之上作为共享流程事实；本机现场只用于继续工作与恢复。
- 不能声称完全没有会话发现/创建工具；当前存在相关工具，但对任意已有 worktree 的绑定有接口限制。
- 指定路径提交不能独自解决共享工作树与 index 并发，需要覆盖实际写入/发布的协调机制。
- 不因路径消失自动 prune，不以最近提交时间判断执行占用，不以归档出现或祖先关系证明代码未被回滚。
- 不使用“若干天后达到扫描上限”的估算作为优先级依据；本次目标来自用户明确的协作方式，而非未经测量的增长预言。

这些是讨论后的设计判断，具体契约以 Technical 草案为准，实际批准以用户确认记录为准。

2026-10-18 用户进一步澄清：“这样子我觉得会产生无意义的多余提交，没必要。就靠 change.json 记录 branch 就行了。”据此取消独立引用文件的提案，保留原 Change 目录，直接使用已有 branch 字段定位。这是用户的明确约束，不是 iclaude 的能力结论。

## 会话工具能力与限制

2026-10-18 重新检查本会话可用工具契约：

| 能力 | 证据强度与边界 |
| --- | --- |
| 列出项目与会话 | `list_projects` / `list_threads` 工具存在；不能因此假定能无遗漏找到任意历史会话，仍须结合本机绑定信息与目标会话核验。 |
| 创建项目会话或新 worktree 会话 | `create_thread` 的 schema 已确认；没有任意 cwd 参数，已有工作区路径不能直接作为参数传入。异步准备与真实 threadId 必须分开处理。 |
| 迁移其他会话 | `handoff_thread` 明确禁止调用会话迁移自己，目标运行会中断；不支持将子 Agent 的独立调用身份当成绕过依据。 |
| 继续已有会话 | 需要真实 threadId、正确 host 和用户授权；消息发送成功不能证明对方位于正确分支。 |
| 自动准确复用既有 worktree | 本项目尚未实测。技术方案提供能力检测与人工打开降级，不承诺未经证实的自动化。 |

此前阅读的官方背景：[Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)、[Remote connections](https://learn.chatgpt.com/docs/remote-connections)，读取日期 2026-10-17。客户端版本和工具能力会变化，实现时应重新检查；仓库内的定位和来源协议不依赖某个客户端专有 API。

## 待实现验证

核心风险已转化为 Plan 的验证项：跨分支发布中断、集中目录并发、来源读取竞态、错误会话绑定、旧模式迁移以及历史原型可用性。当前没有证据支持“全部自动流转已可用”或“多机同 Change 不会撞车”；需求明确了可交付边界。
