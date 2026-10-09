<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 构建产物

默认使用 `.next`，浏览器测试沿用 `.next-e2e`；仅需保留运行中的生产预览时，验证构建才用 `.next-verify`。同目录的生产构建须串行，禁止按任务名新建 `.next-*`，不得删除或覆盖运行中服务的产物。临时验证目录用后清理，避免遗留临时构建路径或失效的类型引用。

## SpecTrail 同步

`.agents/skills/spec-trail/` 的变更合入 `main` 前，须询问用户是否同步至公开仓库 [iTgo-lyq/spec-trail](https://github.com/iTgo-lyq/spec-trail) 的 `skills/spec-trail/`；用户明确同意后，按最终合入版本同步。

## 前端开发

- 先查看 `@open-folio/ui` 的公共导出和独立预览；基础组件放 `packages/ui`，业务组合放 `src/components`，路由和服务端读取留在主应用。通过包入口复用，不复制实现或反向依赖应用。
- 公共样式和 token 由 UI 包维护，组件类名加 `of-ui-` 前缀；页面负责布局与 reset。主应用和预览使用同一实现，示例及 mock 留在预览侧。外部组件先检查来源和现有实现，适配公共接口与 token 后再导出，保留必要来源及许可。
- 保留原生语义、可访问名称、键盘操作和可见焦点；按需展示加载、禁用、空态、错误及窄屏状态。业务数据由调用方传入，有状态的交互明确 React 客户端边界。
- 改动后运行相关类型、格式、构建与交互检查；公共组件同时查看主应用和 UI 预览。命令见根 package.json 与 UI 包 README，不为低影响样式或文档修改新增重复测试。
