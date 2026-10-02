# 原型预览执行记录

## T1：统一原型关联与项目配置校验

新增无第三方依赖的共享契约供 hook、工具和服务使用。扩展可选字段，保留旧数据读取；非法原型关联单独诊断。提交校验检查暂存 HTML 的路径和 blob 模式，拒绝仅在工作区存在的文件、符号链接和删除仍被引用的入口；禁用后允许普通流程更新及删除旧关联。setup 安装器连同共享契约交付，并保留已有自定义脚本。

验证：`npm run typecheck`；`node --conditions=react-server --test tests/prototype-contract.test.ts tests/changes.test.ts`（11 项）；`node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`（5 项）。均通过。新功能端到端与 UI 尚在后续任务范围。

## T2：原型子 skill 与本地交付工具

交付 SpecTrail 内 prototype 子 skill、接入脚本、基础包和共享资源内联导出、静态/Chromium 检查、归档标签推送工具。主 skill 仅保留入口和归档交接。初始化保留已有内容，失败留 pending；拒绝决定持久化；同名异提交标签拒绝覆盖。

`node --conditions=react-server --test tests/prototype-tools.test.ts` 的 4 项场景通过：拒绝/重新同意/幂等接入与设计引用、失败恢复与 symlink 输出保护、运行时网络依赖被 CSP 验证捕获、远端归档标签发布/重试/冲突。修正首次复制到空目录时的 Node cp EEXIST 后复验通过。`quick_validate.py` 和 `npm run typecheck` 通过。浏览器工具仅验证初始加载，正式页面交互和设备适配仍需 T4/T5 验证。
