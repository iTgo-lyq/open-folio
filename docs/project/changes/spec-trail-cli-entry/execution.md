# SpecTrail CLI 验证记录

- **T1**　通过统一入口运行状态、工作区、集成和分享回归，覆盖实际状态写入和 dry-run。Node.js 20 和 24 均通过无仓库环境下的帮助与参数验证。
- **T2**　临时 Git 仓库中运行原型初始化、静态校验和发布请求准备，逐条解析 `stdout`。构建输出进入 `stderr`。原型发布、子模块和版本测试通过。在本地远端测试归档标签的清单与删除，核对无关标签保留。
- **T3**　Setup 测试通过，覆盖实际 hook 接入、无效暂存文件、链接 worktree 和部分提交。PR 事件夹具通过统一入口拒绝未归档 Change，接受有效归档。GitHub Actions 日志确认草稿 PR 的归档检查已使用统一入口，当前拒绝原因为 Change 尚未归档。

## 整体验证

- `npm test` 通过 471 项，`npm run typecheck` 通过。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs .agents/skills/spec-trail/tests/*.test.mjs` 通过 41 项。
- `npm run test:e2e -- tests/browser/hosting.spec.ts -g 'skill CLI'` 通过 1 项，验证配置、构建、上传、登记和浏览器读取。测试使用 Playwright runner 的独立测试浏览器和服务夹具，以隔离管理员会话与发布数据。
- 独立评审检查命令分派、输出与退出码、Git 暂存区传播、文档和 CI 调用。修正了空命令被当作帮助及归档标签删除的必填选项提示。两项修正均通过 Node.js 20/24 CLI 回归，标签维护通过本地远端复测。
