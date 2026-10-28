# 协作者原型验证

本轮由 `gpt-6-astra` subagent 绘制现有 `quiet-changes` 原型。成员最多显示三个头像，其余用 `+N` 收拢，点击头像组查看完整可滚动名单；创建者固定第一。独立创建者列默认隐藏，可在显示菜单恢复，并随个人视图保存。原型保留原有筛选语义。

## 本地验证

- `npm run build --workspace prototype` 成功。
- Astra 复用常驻 Chrome CDP 验证浅色/深色 × 1440、834、390、320px：12 人名单、创建者首位、默认隐藏创建者列、列开关及横向溢出检查均通过。
- `node packages/prototype/verify-deferred-requirement.mjs` 的八组暂缓需求回归通过，无页面错误。
- `npm run screenshot --workspace prototype -- --entry dist/quiet-changes/index.html` 成功生成桌面、iPad、手机标准截图；该命令为受限 iframe 截图使用独立浏览器。
- 本地交互截图位于 Git 忽略的 `artifacts/change-collaborators/`。

这是需求讨论用原型，正式业务尚未实施，等待用户审阅。
