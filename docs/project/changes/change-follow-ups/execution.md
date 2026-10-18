# 实施与验证

## T1：延续关系登记与折叠阅读

交付可选 followUpOf、create / follow-up 命令、列表折叠与详情连续交付上下文；原任务、阶段、执行依赖和每次关闭记录继续独立。筛选先匹配成员，再聚合；已归档入口仍提示本组进行中的调整。关联异常只影响分组，保留单独入口与完成事实。

初轮 `npm test` 224 项通过，Change 与延续关系浏览器回归 14 项通过，类型、格式、skill 校验与生产构建通过。截图核对发现组标题继承全局按钮居中样式，修正为左对齐后复验通过；320px 无横向溢出。独立评审发现的两处边界及修复见 [Review](./review.md)。

开发机环境验证在独立 worktree 完成。Turbopack 不接受跨 worktree 的 node_modules 链接，因此在本 worktree 使用 npm ci 安装依赖；浏览器使用 .next-e2e，生产构建使用 .next。

评审修复后重新运行：`npm test` 224/224；`npx playwright test tests/browser/follow-ups.spec.ts tests/browser/changes.spec.ts` 14/14；`npm run typecheck`、`npm run format:check`、`npm run build`、skill quick_validate 与 `git diff --check` 均通过。浏览器覆盖折叠、键盘、筛选后根不匹配、活跃后继、取消记录、独立详情深链接及刷新、格式错误关联提示与 320px。
