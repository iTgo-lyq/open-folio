# 执行与验证

## T1：未实际移交的需求可持续记录，已移交需求保持正确归属

共享归属规则区分预填名称、继承记录和实际所属来源。CLI、工作区定位、后台读取与 hook 按各自可获取的真实事实使用同一规则；集中规划可保留原 branch 名继续澄清，实际来源优先，已知来源丢失及读取错误保留诊断。locate 不把主工作区称为执行工作区，显式 handoff 沿用预填名称，普通与子项登记均避免空提交。hook 继续只读本地 Git，支持原有增删、重命名和部分提交保护。

补充技能中“只记录、暂不启动”的约定，暂停不等于任务受阻，澄清不自动恢复；不新增持久化状态或迁移。应用及技能版本统一为 0.1.5。

验证：

- Setup/真实 hook 回归：24 项通过，含预填名称与继承 ref 放行、已有远端跟踪归属保护，以及原有失败现场和部分提交检查。
- `node --conditions=react-server --test tests/central-reading.test.ts tests/routing.test.ts tests/workspace-routing.test.ts tests/state-commands.test.ts tests/xlarge-integration.test.ts`：53 项通过，覆盖新的预填目标澄清、实际所属来源优先和已知远端丢失，以及现有生命周期、归档、取消、父子交付和失败恢复。
- 新增的预填子 Change 移交用例单独复验通过，确认不制造空登记提交、保留父项实现且支持重复调用。测试曾发现无变化时重写 JSON 导致临时工作区变脏，已修正为不重写文件再通过。
- `npm run typecheck`、`git diff --check` 和应用/锁文件/技能版本一致性检查通过。

所有 Git 场景使用临时测试仓库；未改用户数据或共享暂存区。后台扫描语义版本递增，使旧快照按既有缓存机制重算。
