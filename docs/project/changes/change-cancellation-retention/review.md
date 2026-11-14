# 验收评审

评审范围为 `origin/develop...ccb214e` 的完整差异，依据 [Requirement](./requirement.md) 与 [Execution](./execution.md)。主审检查 CLI、状态与分支路由；两个独立评审分别检查服务端读取，以及工作流接入与文档。所有新增实验使用临时 Git 仓库，不访问运行数据。

## R1 — 撤回：旧缓存升级不属于本次验收范围

原建议针对旧版本持久化缓存的升级处理。用户明确“不要考虑旧数据兼容，第一个问题我不接受”，因此撤回 R1，不再将其列为缺陷、修复任务或验收阻塞，也不要求为此调整扫描指纹或补充升级回归。本次验收不纳入旧数据兼容要求。

其余发现保留原编号：R2、R3 为 P2，R4 为 P3。

## R2 — P2：历史快照的取消预览误走正式交付定位

- 位置：`src/server/previews.ts:244`，调用方为 `src/server/store.ts:719`。
- 触发：同一版本内，新建且尚未移交的 Change 在集成分支取消留存后，仍持有取消前 `snapshotId` 的页面请求该 Change 原型；不涉及旧版本数据兼容。
- 证据：临时仓库通过 CLI `change cancel --mode keep` 完成留存，确认 HTML 已固定到归档的 `previews/page`、源码提交保留且归档无诊断。当前预览成功；旧快照预览提示“未记录可定位的交付版本”；直接请求旧快照对应的同一 SHA 则成功。
- 原因：`route` 来自最新快照，判断取消状态的 `candidate` 却来自历史快照，历史状态仍是 active，因而被误判为需要合并提交的正常交付。
- 最小修复：使用最新权威记录决定是否属于取消归档；历史候选只用于选择读取版本。保留当前原型配置与已推送引用可达性检查。
- 复验依据：实际 CLI 产生的取消归档，在当前入口、旧快照入口及同版本 SHA 入口均能读取原有原型；当前实现只在旧快照入口失败。

## R3 — P2：发布检查的取消例外遗漏目录身份校验

- 位置：`.agents/skills/spec-trail/scripts/setup/check-pr.mjs:144`。
- 触发：集成分支新增 `archive/2026-11-15-planned/change.json`，内部使用另一个合法 ID，状态及其他字段符合取消归档结构；发布候选原样携带该目录。
- 证据：真实临时 Git 仓库中，发布检查返回 `kind: release`，取消项未计入交付；同一记录经 `routeCatalog` 却报告目录 ID 与 `change.json.id` 不一致。正常完成归档会通过 `archive()` 检查身份，取消例外提前跳过了该检查。
- 影响：无效身份的取消归档可以通过发布检查进入只读历史，工作台仍将其判为异常。
- 最小修复：取消例外放行前检查记录可读且 `state.id === id`，补充不匹配用例；不增加交付 PR 或完成四步的要求。
- 复验依据：有效取消历史仍可随发布携带且不计为交付，目录身份不一致则明确拒绝；当前实现放行了后者。

## R4 — P3：通用归档说明未区分取消留存

- 位置：`.agents/skills/spec-trail/SKILL.md:61`、`:309`，`README.md:175`，以及 `.agents/skills/spec-trail/scripts/state/stage.mjs:24`、`:101` 的帮助说明。
- 证据：通用说明仍称未集成归档可通过 `stage rework` 恢复，并泛称归档来源分支与工作区可以清理；新取消规则则明确要求保留取消工作分支、停止推进和合入。
- 影响：读者可能对取消归档尝试错误的返工或清理流程。现有冻结与清理保护仍会拒绝相关操作，本轮未发现由此导致的实际误删路径。
- 最小修复：将正常交付的说明限定为“已完成交付的归档”，明确取消归档不适用。删除笼统表述，不放宽实现保护。
- 复验依据：Skill、README 与 CLI 帮助对完成归档、取消归档使用一致术语。

## 设计精简结论

- 保留：先推送工作分支完整归档、再标记集中入口，保证留存材料确实存在；取消时间、原因与归属的一致性检查防止错误来源替代。
- 保留：取消分支占用与清理保护、发布时的归档子树一致性检查，分别保护留存成果及只读历史，不属于多余门禁或哈希校验。
- 合并／建议删除：统一完成归档与取消归档的术语，删除无条件适用返工、交付及清理规则的旧说明。
- 延后：Specs 按既有关闭顺序在验收后同步，重点核对 `docs/project/specs/change-workflow/spec.md` 的取消路径、提交保护例外和发布历史规则；当前尚未执行 Specs 步骤，不将这一点单列为缺陷。
- 未发现本次引入的双版本读写、自动迁移或需要保留的旧取消命令兼容层。上述修复可在现有机制内完成，不需要扩展架构或削弱保护。

## 验证证据

本轮针对性回归合计 134 项通过：

```sh
node --conditions=react-server --test --test-concurrency=3 tests/state-commands.test.ts tests/workspace-routing.test.ts tests/xlarge-integration.test.ts tests/migration-routing.test.ts
node --conditions=react-server --test tests/changes.test.ts tests/previews.test.ts tests/release-archives.test.ts
node --conditions=react-server --test tests/pr-archive-check.test.ts
env -u GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT=0 node --test .agents/skills/spec-trail/tests/*.test.mjs
```

对应结果依次为 52、43、18、21 项通过。Skill 初跑为 19/21，会话注入的 `core.hooksPath` 干扰了两个空配置断言；只隔离测试子进程的 Git 配置后 21/21 通过，未修改实际 hooks 或仓库配置。

`npm run typecheck`、`cli setup check` 与分支差异的 `git diff --check` 通过。本轮未重新执行全量应用测试、生产构建或浏览器回归，未更新服务；此前结果仍以 Execution 为准。

现存 `prototype-favicon-refresh` 的取消迁移已核实：工作分支 `c57b722` 保留原始取消时间、原因、阶段与任务，协作入口 `e38c0da` 记录相同取消信息；迁移前后材料目录树一致。

## 整改复验

- **R2** 预览路由按最新权威记录识别取消归档，历史快照继续提供读取提交。使用 CLI 生成取消归档后，当前入口、取消前快照及对应 SHA 三种请求均返回原型。
- **R3** 发布检查核对取消归档的目录 ID 与状态 ID。有效取消历史可以随发布保留，身份不一致会被拒绝，取消项不计为交付。
- **R4** 主 Skill、交付说明、README 和 CLI 帮助都将恢复返修及合入后清理限定为已完成交付的归档。
