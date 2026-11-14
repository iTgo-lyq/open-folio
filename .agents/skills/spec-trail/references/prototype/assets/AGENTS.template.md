# 原型包

遵循项目根 AGENTS.md、本包 DESIGN.md 和 spec-trail skill 的原型约定。

- prototype.json 的每个入口是一个业务页面片段，例如页面框架、业务大表单或列表区；不做原子组件预览，也不实现完整应用。
- 入口源码放在本包，按源码路径或已有别名直接引用业务组件，业务仓库不为原型新增导出。数据请求、路由和服务端模块在构建中替换为本包 mock，状态只在内存中。
- 引用业务代码需要大改业务仓库时，在本包内做轻量实现。
- build 脚本沿用业务仓库的技术栈，每个入口输出一个静态页：托管为 `dist/<id>/index.html`，Git 兜底为自包含的 `preview/<id>/index.html`。
- 当前入口维护在 prototype.json，Change 的固定引用在 change.json 的 previews。
