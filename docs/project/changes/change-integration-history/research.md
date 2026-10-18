# 合入历史方案依据

## 用户决定

本次方案沿用同一会话已经讨论并确认的决定：

- 分支创建频率不是问题，目标是交付后不积累无用分支与工作区。
- 不依赖 PR；每个归档 Change 用一个合并提交合入协作分支，从提交标记关联整体 diff，`change.json` 不记录合并提交。
- 归档不可修改，不考虑同一 Change 提前分批合入。
- 原型也通过合并提交定位，不再另建保留标签。
- 对旧原型无需补关联，找不到就留空；当前项目无需历史兼容。
- 文档整理授权：“可以，按这个方案推进。先整理成正式的需求和技术方案，确认后再实现。”

这些决定直接约束本次文档，不额外设计迁移映射、长期分支留存或旧标签兜底。

## 仓库调查

读取日期：2026-10-18。此次方案优化已同步远端 develop 至 `6f2227c`，纳入逐模块配图和技术方案精简规则；已撤回的 testing-strategy 子 skill 不再作为依据。

| 位置 | 已核实事实及设计影响 |
| --- | --- |
| `docs/project/workflow.json` | 协作分支 develop、保护分支 main；已启用唯一原型包与 custom 托管。 |
| `.agents/skills/spec-trail/SKILL.md` | 当前快进集成、默认保留工作分支，归档后只读；新规则须同时更新合码、关闭和清理说明。 |
| `.agents/skills/spec-trail/prototype/scripts/archive.mjs` | 当前归档保留标签生成入口，需与子 skill 和主归档提示一并退出。 |
| `src/server/git.ts` | 定向读取协作及登记来源；归档预览精确拉取保留标签到 `refs/openfolio/archive-v2/`，没有合入索引。 |
| `src/server/store.ts`、`src/lib/model.ts` | 快照 cacheSchemaVersion 为 5，保存 archiveRefs/archivePins；新派生协议需使旧缓存失效重建。 |
| `src/server/previews.ts` | 归档默认及显式 revision 都校验标签；替换时须一并处理固定版本请求。 |
| `src/server/repository-api.ts` | 私有仓库读取统一经过会话与连接授权，可复用入口新增只读 diff。 |
| `src/components/changes.tsx` | 详情已有概览、任务、文档、原型、依据页签；任务 commitTitle 只是文本线索，没有整体 diff。 |
| `src/server/public-previews.ts` | 已准备公开版本独立持久化；去除 Git 标签不需要删除发布内容。 |

当前 8 个本地及远端保留标签的后缀为：

```text
browser-identities
change-prototype-preview
personal-workbench
prototype-hosting
prototype-r2-storage
prototype-thumbnail-publication
token-workspaces
workbench-clarification-history
```

共同前缀为 `spec-trail/archive-v2/`。调查时目标均是协作分支可达的单亲归档提交，不能直接作为新协议的双亲合入记录。此清单仅为调查快照；实际删除前重新查询并核对精确 ref 与对象，不以数量为删除依据。

## iclaude 讨论

此前按用户要求，通过本机 iclaude CLI 进行了只读产品方案讨论，未授予其仓库写入或工具调用能力。最终讨论支持单次归档合入、合并提交关联、无标签原型和合入后自动清理，并特别核对了两个约束：

1. 归档一致性必须比较 `M` 与 `M^2`，不能依赖后续会删除的工作分支名称或 tip。
2. 协作分支推送冲突时应从新 tip 重建未发布候选，不能在旧候选上再合远端，使其他交付绕出 first-parent 链。

用户随后明确放弃历史兼容，最终方案据此移除旧关联回填；保留活动/未合入固定版本预览，清理不增加逐次人工审批。

## Git 语义依据

- [git-merge 官方文档](https://git-scm.com/docs/git-merge)：`--no-ff` 在可快进时仍形成合并提交，保留父提交关系。
- [git-diff 官方文档](https://git-scm.com/docs/git-diff)：比较两个提交表示两端树差异，本方案采用 `M^1` 与 `M`，不使用三点 merge-base 差异或默认 combined merge diff。

以上 Git 基础能力足以保存交付边界与差异，PR 不是必要前提。远端托管产物的长期可用性仍属于宿主已有职责，Git 合并提交仅固定其引用及仓库内产物。
