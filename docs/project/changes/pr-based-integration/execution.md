# 实施与验证证据

## T1

共用关联器通过 PR 正文、仓库和源目标分支匹配，平台已合并记录提供 M，Git 验证其可达性；差异读取不检查提交消息。CLI preflight/verify、归档返修和发布检查接入同一证据；清理保持独立的来源纳入与文件、引用竞争保护。GitHub 读取适配器完整分页、失败拒绝部分结果，CI 与 Setup 模板仅增加 PR 只读权限。工作台快照接线与移除旧扫描入口由 T2 完成。

- `node --conditions=react-server --test tests/integration-prs.test.ts tests/integration-delivery.test.ts tests/pr-archive-check.test.ts tests/archive-rework.test.ts`：28 项通过，覆盖默认合并消息、精确关联、重复 PR、读取失败、双亲差异不可用、归档返修及安全清理。
- `node --test .agents/skills/spec-trail/tests/*.test.mjs .agents/skills/spec-trail/setup/tests/*.test.mjs`：27 项通过。
- `npm run typecheck` 及 `git diff --check` 通过；修改的 TypeScript 测试已格式化。
- `node .agents/skills/spec-trail/scripts/integration.mjs verify --change integration-history-recovery`：真实只读验证得到 PR #25 对应 M `7fdf990930a4d247b926f47ba26d615fe7858584`，来源已删除仍可核实；sourceAbsent=true、sourceIncluded=null，没有执行删除。

## T2

工作台在同一批 PR 读取后统一计算交付状态与集成差异索引，移除 Git 提交消息扫描。正式合入以精确关联的唯一已合并 PR 及其 M 可达性为据；差异不可读取只影响差异展示，不撤销已核实的合入事实。PR 读取失败保留旧 PR 展示，但不将旧结果当作本次成功证据。历史显式发布覆盖仍保留原有语义。

索引版本升级为 3；同一 Git tip 下仍重新核实 PR 关联，旧索引在自动刷新时立即重算。仅当索引版本和 M 均相同时复用不可变差异；不可用差异可再次读取。测试数据改为显式平台 PR 记录，覆盖默认合并消息、来源删除、重复关联、读取失败及恢复。

- `npm test`：354 项通过，覆盖工作台、CLI、发布检查、归档返修与清理等回归。
- `node --test .agents/skills/spec-trail/tests/*.test.mjs .agents/skills/spec-trail/setup/tests/*.test.mjs`：27 项通过。
- `npm run test:e2e -- tests/browser/integration.spec.ts tests/browser/delivery.spec.ts`：5 项通过，覆盖交付标签、PR 展示、差异读取、历史、窄屏、失败重试和跨 Change 过期响应隔离。
- 补充自动刷新旧索引迁移条件后，`node --conditions=react-server --test tests/integration-records.test.ts`：9 项通过；最终 `npm run typecheck`、`npm run format:check`、`npm run build` 与 `git diff --check` 通过。构建位于本 Change worktree 的 `.next`。
- 独立评审：隔离上下文的 `integration_review` subagent 只读检查相对 `origin/develop` 的整个实现差异、验收对应与测试覆盖，未发现需要修改的可行动问题。额外局部实验通过：已核实合入后 PR 读取失败时转为待核实且成功时间不推进，同 tip 恢复读取后重新确认原 M。

本轮验证未更新长期服务；服务更新在人工验收、归档并集成后执行。尚未进行部署后的真实登录冒烟。
