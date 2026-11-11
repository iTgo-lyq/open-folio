# 实施与验证

## T1 对齐浏览器分组断言并完成相关与全量回归

### 当前 main 的原始复现

2026-11-11 定向 fetch 后，远端 main 为 `91c235f37bb6cda20b62b0b66b789d4a2daf94f8`。在工具创建的独立 worktree 以此提交 detached HEAD 执行未修改测试；当时 develop 为 `9284b0a`，两者文件树完全相同，main 额外的 24 个提交均为发布合并历史。

```bash
npm ci
npm run test:e2e -- tests/browser/changes.spec.ts tests/browser/change-labels.spec.ts tests/browser/change-reader.spec.ts tests/browser/change-directory.spec.ts tests/browser/follow-ups.spec.ts --grep 'list filters, inline materials|list and board share stable urgency|adjacent Changes follow|deferred requirements and stage dots|continuations show grouped deliveries' --reporter=line
```

结果：4 failed、1 passed（1.6 分钟）。

| 场景 | 原始结果与原因 |
| --- | --- |
| changes：list filters, inline materials | 失败：旧阶段看板定位到 0 列，期望 5；实际为默认处理状态看板四列 |
| change-labels：list and board share stable urgency | 失败：旧阶段看板找不到链接，返回空数组；实际为处理状态看板 |
| change-reader：adjacent Changes follow | 失败：点击旧阶段看板中的首条链接超时；实际保留入口 `group=none` 的不分组看板 |
| change-directory：deferred requirements and stage dots | 通过：先验证处理状态看板，再显式选择阶段，五列断言正确 |
| follow-ups：continuations show grouped deliveries | 失败：连续交付 region 期望 1、实际 2；source-connect 位于待集成，technical-budget 位于交付待核实 |

本地原始日志：`/tmp/openfolio-browser-main-repro.log`；失败快照和 trace 保存于 `/tmp/openfolio-browser-main-repro-results/`。这些临时材料不提交，关键结果保存在本文件。

自动化沿用仓库 Playwright 的独立 context 与 fixture 测试服务（10682/10684、`.next-e2e`），因为套件需要重置模拟会话、设置权限及验证多账号隔离；不使用共享 Chrome 默认 context，不访问常驻用户数据，也未执行模型测试。新 worktree 由应用管理工具分配路径，handoff 复用该已登记工作区。
