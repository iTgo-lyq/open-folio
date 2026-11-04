# 验证记录

## T1

标记解析允许只含版本的发布；省略 Change 清单时拒绝归档目录变化。工作台缓存接受空清单，并保留已有 Change 发布的校验。

- `node --conditions=react-server --test tests/pr-markers.test.ts tests/pr-archive-check.test.ts tests/pull-requests.test.ts tests/delivery.test.ts tests/xlarge-integration.test.ts .agents/skills/spec-trail/tests/version.test.mjs`：39 项通过。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：24 项通过。
- `npm run typecheck`：通过。
- skill 校验、版本一致性、改动范围格式检查及 `git diff --check`：通过；保留既有测试末尾的原格式，避免无关格式差异。

Agent 自查覆盖新增行为、归档增改删拒绝、非法标记、有 Change 发布和磁盘缓存/304 刷新。未修改 UI，无需原型或浏览器交互验收。生产构建、部署及发布 PR CI 在集成后按项目约定完成。
