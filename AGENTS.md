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

- 开发 `@open-folio/ui` 前先读 [包内 README](packages/ui/README.md)，组件接口、预览与验证按包内约定执行。
- 基础组件和主题放 `packages/ui`，业务组合放 `src/components`；通过包入口复用，公共样式使用 `of-ui-` 前缀。
