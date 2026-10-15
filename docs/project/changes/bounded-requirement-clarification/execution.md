# T1 分轮澄清与确认摘要契约

实现提交：66f49de。

迁入 grilling 的决策树、frontier、分轮格式、等待与重算、事实调查和收敛指导，增加 3/6/12/16 问题预算。新增问答语义命令与共享校验，工作台读取保留可选 clarifications；全部四类确认写入限制为单行、最多 60 个 Unicode 码点，内容与单句要求由 skill 约束。

## 验证证据

- `node --conditions=react-server --test tests/state-commands.test.ts tests/changes.test.ts`：27 项通过，覆盖问答补录、更正、撤回、返工保留、失败不写入、四种确认边界及旧记录兼容。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs tests/skill-sync.test.ts`：13 项通过，hook 与分发验证通过。
- `npm run typecheck`、skill-creator 的 `quick_validate.py`、相关文件 Prettier 检查及 `git diff --check main`：通过。
- 独立 subagent 评审实现、需求对应及验证证据；指出本 Change 的计划摘要包含常规验证清单，已通过语义命令精简，复验无待修问题。
- `npm run service:update`：停止原服务、构建 .next、启动成功；服务运行提交 66f49de，dirty=false。
- 使用本地忽略配置中的 Token 登录真实工作台，刷新并读取本仓库：首页 200、登录 201、工作台 200；本 Change 的 requirement/technical/plan 摘要与推送记录一致，无 SCHEMA_INVALID。最终冒烟脚本成功并移除本次验证会话。

## 验收对应

澄清核心指导与规模预算经独立评审核对；问答契约和摘要限制有行为测试；真实服务可读取本次交付。无未解决实现问题。新增字段未改变既有确认、验收和归档要求。
