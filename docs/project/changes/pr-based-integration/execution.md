# 实施与验证证据

## T1

共用关联器通过 PR 正文、仓库和源目标分支匹配，平台已合并记录提供 M，Git 验证其可达性；差异读取不检查提交消息。CLI preflight/verify、归档返修和发布检查接入同一证据；清理保持独立的来源纳入与文件、引用竞争保护。GitHub 读取适配器完整分页、失败拒绝部分结果，CI 与 Setup 模板仅增加 PR 只读权限。工作台快照接线与移除旧扫描入口由 T2 完成。

- `node --conditions=react-server --test tests/integration-prs.test.ts tests/integration-delivery.test.ts tests/pr-archive-check.test.ts tests/archive-rework.test.ts`：28 项通过，覆盖默认合并消息、精确关联、重复 PR、读取失败、双亲差异不可用、归档返修及安全清理。
- `node --test .agents/skills/spec-trail/tests/*.test.mjs .agents/skills/spec-trail/setup/tests/*.test.mjs`：27 项通过。
- `npm run typecheck` 及 `git diff --check` 通过；修改的 TypeScript 测试已格式化。
- `node .agents/skills/spec-trail/scripts/integration.mjs verify --change integration-history-recovery`：真实只读验证得到 PR #25 对应 M `7fdf990930a4d247b926f47ba26d615fe7858584`，来源已删除仍可核实；sourceAbsent=true、sourceIncluded=null，没有执行删除。
