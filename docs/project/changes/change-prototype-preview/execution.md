# 原型预览执行记录

## T1：统一原型关联与项目配置校验

新增无第三方依赖的共享契约供 hook、工具和服务使用。扩展可选字段，保留旧数据读取；非法原型关联单独诊断。提交校验检查暂存 HTML 的路径和 blob 模式，拒绝仅在工作区存在的文件、符号链接和删除仍被引用的入口；禁用后允许普通流程更新及删除旧关联。setup 安装器连同共享契约交付，并保留已有自定义脚本。

验证：`npm run typecheck`；`node --conditions=react-server --test tests/prototype-contract.test.ts tests/changes.test.ts`（11 项）；`node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`（5 项）。均通过。新功能端到端与 UI 尚在后续任务范围。
