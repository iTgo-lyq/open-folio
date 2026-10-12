<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 开发机服务与数据

- 默认是开发机环境，Merlin 长期暴露的 OpenFolio 服务用于开发验证。影响服务实现的任务完成后，将该服务更新到已验证的最新实现。
- 常规更新允许短暂停机，按停止服务、构建、启动、验证的顺序执行，不创建回滚快照或例行备份，也不累积备份历史。破坏性更新或排查 bug 确有需要时，只做最小必要备份，用后清理。
- `/home/tiger/.local/share/open-folio` 是当前运行数据目录，包含登录状态、凭据密钥、工作台偏好及可重建缓存。一般不主动删除；仅在破坏性更新或修复 bug 确有需要时，针对必要范围处理，避免每次部署重置登录和工作台。
- 部署后的冒烟检查由负责本次任务的 Agent 根据改动自主选择，不维护固定冒烟脚本。需要登录真实工作台时，从 Git 忽略的本地环境配置读取 Token；`.env.example` 仅保存配置项与占位值。
- 服务管理使用 `npm run service:start`、`service:stop`、`service:status`、`service:update`；配置项见 `.env.example`，真实值放 Git 忽略的 `.env`，也支持 `.env.local` 覆盖。原型截图使用 `npm run screenshot --workspace prototype -- --entry dist/<id>/index.html`，参数见包内 README。正式脚本不放在 `artifacts/` 或 `.openfolio/`。

## 构建产物

默认使用 `.next`，浏览器测试沿用 `.next-e2e`；仅需保持服务运行期间进行验证构建时，才用 `.next-verify`。同目录的生产构建须串行，禁止按任务名新建 `.next-*`，不得删除或覆盖运行中服务的产物；常规更新先停止服务，再重新构建 `.next`。临时验证目录用后清理，避免遗留临时构建路径或失效的类型引用。

## SpecTrail 同步

`.agents/skills/spec-trail/` 的变更合入 `main` 后，由 [GitHub Actions](.github/workflows/sync-spec-trail.yml) 自动同步至公开仓库 [iTgo-lyq/spec-trail](https://github.com/iTgo-lyq/spec-trail) 的 `skills/spec-trail/`，无需逐次确认。以 `main` 已提交内容为准，保留分发仓库的 `LICENSE`。

## 前端开发

- 开发 `@open-folio/ui` 前先读 [包内 README](packages/ui/README.md)，组件接口、预览与验证按包内约定执行。
- 基础组件和主题放 `packages/ui`，业务组合放 `src/components`；通过包入口复用，公共样式使用 `of-ui-` 前缀。
