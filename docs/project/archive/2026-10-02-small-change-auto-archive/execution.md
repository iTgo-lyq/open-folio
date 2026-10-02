# 执行记录

## T1：调整 small 关闭规则并对齐工作台验收标签

SpecTrail 阶段表、关闭顺序、整体验证和验收说明已统一：small 默认由 Agent 按验收标准自验收，再同步 Specs、归档提交推送；需要人工验收的规模和显式要求保留原等待规则。验收摘要与来源明确区分 Agent 自验收和用户验收，沿用现有 JSON 字段及枚举。工作台步骤标签改为“验收”。

验证记录：

- `python3 /home/tiger/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/spec-trail` 通过。
- `node --conditions=react-server --test --test-name-pattern='strict schema agrees|size routes' tests/changes.test.ts`：2/2 通过，涵盖 schema/hook 兼容、规模路线和关闭顺序。
- `npm run typecheck`、`npm run format:check`、`git diff --check` 通过。
- 使用已安装的 Chromium 运行 `tests/browser/changes.spec.ts` 中归档依据场景：1/1 通过，既有人工验收记录仍可见。
- `OPENFOLIO_BUILD_DIR=.next-auto-archive npm run build` 通过；构建目录与现有运行产物分开，恢复了 Next 自动添加的临时 TypeScript include 配置。
- Agent 自查覆盖：small 成功后继续关闭；验证失败或未满足验收项进入返工；用户明确要求人工验收的 small 等待；medium/large/xlarge 等待人工验收；超出 small 范围按既有规模调整处理。

没有改变 schema、hook、任务完成判断或合码授权规则。新规则仅允许满足条件的 small 自验收，不把测试结果写成人工验收。
