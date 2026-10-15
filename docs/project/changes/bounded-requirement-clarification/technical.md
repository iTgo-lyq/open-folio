# 方案

将分轮指导、规模预算及摘要规则直接写入主 skill，保持可独立分发。clarifications 为可选 Q 编号映射，条目含 round、question、recommendation，可选 answer、source、withdrawn；withdrawn 保存不再适用的原因，原问答仍保留。

新增 clarification-ask / clarification-answer / clarification-withdraw 命令，复用分支、状态、锁、原子写入和 dry-run 约束。提问记录仅追加稳定编号，回答可按新反馈更正，撤回不可继续回答；轮次、问题数由记录推导。命令保存已发生事实，追问预算由 Agent 在发问前执行，用户明确允许的超额问题仍可记录。

共享校验导出问答校验入口供工作台复用，模型补充可选类型。confirm 写入时按 Unicode 码点统计 summary，拒绝超过 60 字符和换行；单句与内容质量由 Agent 核对，读校验不追溯限制旧摘要。

## 影响

新增可选字段，无需迁移旧文档。问答不代表确认，不自动推进阶段；需求结论仍写 Requirement。更正回答若实质改变需求，沿用 rework 清理失效确认。

## 验证

覆盖问答完整命令路径、撤回与更正、非法记录、dry-run、返工保留、四阶段摘要边界和旧摘要兼容；运行共享校验与工作台集成测试、类型检查、skill 校验。独立评审后按 service:update 停服构建启动，并验证服务响应。
