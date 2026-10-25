<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 开发机服务与数据

- 默认是开发机环境，Merlin 长期暴露的 OpenFolio 服务用于开发验证。影响服务实现的任务完成后，将该服务更新到已验证的最新实现。
- 主工作区为 `/home/tiger/workspace/open-folio`，协作分支为 `develop`；长期服务在此构建，使用该目录的 `.next` 运行。
- 本仓库 worktree 默认路径为 `/home/tiger/workspace/open-folio-worktrees/<工作区名>`。
- 本机长期服务端口为 `11117`，tmux 会话为 `openfolio-public-preview`。服务管理命令在主工作区运行，也可使用 `npm --prefix /home/tiger/workspace/open-folio run service:status` 等形式。
- 更新长期服务前确认待部署提交已集成并验证，按需安装依赖，执行 `service:update` 和冒烟检查；该命令只构建当前工作区，不自动拉取或切分支。服务进程由 tmux 托管，不依赖 Agent 会话，脚本不提供机器重启后的自启配置。
- 常规更新允许短暂停机，按停止服务、构建、启动、验证的顺序执行，不创建回滚快照或例行备份，也不累积备份历史。破坏性更新或排查 bug 确有需要时，只做最小必要备份，用后清理。
- `/home/tiger/.local/share/open-folio-public` 是当前运行数据目录，包含登录状态、凭据密钥、工作台偏好及可重建缓存。一般不主动删除；仅在破坏性更新或修复 bug 确有需要时，针对必要范围处理，避免每次部署重置登录和工作台。
- 开发分支交给用户验收时，确认数据兼容后，优先通过 `OPENFOLIO_DATA_DIR` 复用常驻数据目录及配套配置、密钥，避免重复注册或绑定 Token。数据目录只允许单实例使用，切换前停止占用实例，验收结束后切回常驻服务。
- 部署后的冒烟检查由负责本次任务的 Agent 根据改动自主选择，不维护固定冒烟脚本。需要登录真实工作台时，从 Git 忽略的本地环境配置读取专用账号密码和 Token；`.env.example` 仅保存配置项与占位值。
- 真实登录冒烟统一使用 `scripts/smoke-session.ts` 的 `withSmokeSession`，每个测试浏览器使用独立调用，所有检查在回调内完成并等待结束；浏览器上下文通过回调提供的 `browserCookie` 登录，不复用用户 Cookie、不在回调外另建登录。包装器在成功或失败后读取最新版本号退出，并复查匿名且无可见绑定，账号绑定保留；清理失败必须报告，不得忽略非 2xx 响应或把冒烟标为成功。用法见 README；不得通过退出全部设备或直接修改数据文件收尾。
- 服务管理使用 `npm run service:start`、`service:stop`、`service:status`、`service:update`；配置项见 `.env.example`，真实值放 Git 忽略的 `.env`，也支持 `.env.local` 覆盖。原型截图使用 `npm run screenshot --workspace prototype -- --entry dist/<id>/index.html`，参数见包内 README。正式脚本不放在 `artifacts/` 或 `.openfolio/`。

## 构建产物

生产与验证构建统一使用 `.next`，浏览器测试沿用 `.next-e2e`，不新建其他 `.next-*` 目录。开发机允许短暂停机；构建 `.next` 前先停止使用该目录的服务，构建成功后再启动并验证。同目录的生产构建须串行，不得删除或覆盖运行中服务的产物。

`.next` 是可重建的构建产物，切换 Git 分支不会自动重建它。本仓库长期服务固定使用主工作区 `/home/tiger/workspace/open-folio/.next`，从主工作区的 `develop` 构建更新；任务 worktree 的 `.next` 仅用于各自验证。实际构建与运行提交以主工作区中的 `.openfolio/build-version.json`、`runtime-version.json` 为准；用户数据位于上面的持久数据目录，不在 `.next` 中。

## SpecTrail 分发

`.agents/skills/spec-trail/` 是技能的唯一源码与公开安装入口，与 OpenFolio 在同一仓库维护，不再向独立仓库同步。技能内容及根目录的 `version.json` 一起提交，保留技能包的 MIT `LICENSE`。安装说明见 [SpecTrail](docs/spec-trail.md)，介绍站源码在 `website/`。

## 前端开发

- 开发 `@open-folio/ui` 前先读 [包内 README](packages/ui/README.md)，组件接口、预览与验证按包内约定执行。
- 基础组件和主题放 `packages/ui`，业务组合放 `src/components`；通过包入口复用，公共样式使用 `of-ui-` 前缀。
