# 执行验证

- 临时 Git 仓库覆盖留存、删除、未推送归档拒绝标记、删除协作入口、取消分支名冲突及父子 Change 校验。
- 工作台用例确认留存记录从工作分支读取任务和正文，取消材料与发布交付分别处理。浏览器回归验证窄屏的已取消详情与历史材料入口。
- 本仓库的 `prototype-favicon-refresh` 使用原取消日期归档。工作分支 `c57b722` 移动三份材料，协作分支 `e38c0da` 写入同一取消时间与原因。两次提交均已推送，CLI 从工作分支读回归档。

应用测试 468 项、Skill 测试 21 项、取消详情浏览器测试 1 项通过，准备检查、类型检查与生产构建通过。一次并发回归中服务生命周期用例停止超时，单独复跑和最终全量复跑通过。

## 复跑

```sh
node --conditions=react-server --test --test-concurrency=6 tests/*.test.ts
node --test .agents/skills/spec-trail/tests/*.test.mjs
node .agents/skills/spec-trail/cli.mjs setup check
npm run typecheck
npm run build
npm run test:e2e -- tests/browser/changes.spec.ts -g 'cancelled and invalid'
```

## 验收评审整改

R2–R4 的变更及复验见[评审记录](review.md)。预览和发布检查的两个复现用例均在修复前失败，修复后通过。预览、PR 检查、归档返工与发布归档的定向回归共 46 项通过。

全量应用测试 469 项、Skill 测试 21 项通过。类型检查、生产构建、接入检查与介绍站静态校验通过。
