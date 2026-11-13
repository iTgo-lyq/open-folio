# SpecTrail CLI 验证记录

- **T1**　通过统一入口运行状态、工作区、集成和分享回归，覆盖实际状态写入和 dry-run。Node.js 20 和 24 均通过无仓库环境下的帮助与参数验证。
- **T2**　临时 Git 仓库中运行原型初始化、静态校验和发布请求准备，逐条解析 `stdout`。构建输出进入 `stderr`。原型发布、子模块和版本测试通过。在本地远端测试归档标签的清单与删除，核对无关标签保留。
- **T3**　Setup 测试通过，覆盖实际 hook 接入、无效暂存文件、链接 worktree 和部分提交。PR 事件夹具通过统一入口拒绝未归档 Change，接受有效归档。GitHub Actions 日志确认草稿 PR 的归档检查已使用统一入口，当前拒绝原因为 Change 尚未归档。
- **T4**　验收返修。`tests/cli.test.mjs` 遍历全部 49 个命令（T4 状态里的 verification 误写为 51，以此处为准），校验三项内容：总帮助包含每个命令的完整用法与用途，每个参数都有值格式和说明并出现在命令帮助中，命令帮助带有示例。另覆盖 `--result`、`--hosting` 的取值错误：退出码 1，`stdout` 为空，`stderr` 列出可选值。Node.js 20 与 24 均通过，原型用例在 Node.js 20 按约定跳过。文档中 46 处 CLI 示例的命令、参数及 6 处固定取值均合法。临时仓库按新 hook 实际提交：成功时没有 SpecTrail 输出，拒绝时 `stdout` 为空、`stderr` 给出原因。Setup 测试新增断言：检查器建议命令带 `>/dev/null`，转发 hook 成功提交不含 JSON。skill 测试 42 项通过；项目 `npm test` 470/471，唯一失败为 T5 处理的服务测试。
- **T5**　原失败可在本机复现，develop 基线 57b9eb8 上同样失败。根因有两点：外部 tmux server 运行在宿主网络命名空间，沙箱内的就绪检查连不上测试服务；独立 server 在最后一个会话结束时退出，被停止的 supervisor 过继给不回收子进程的沙箱包装进程，成为僵尸，停止等待超时。改为私有、`exit-empty off` 的 tmux server 后，沙箱内连续两次通过（约 2 秒），宿主环境经 `host-bash` 复跑也通过。默认 tmux server 上没有 `folio-test` 会话，没有残留进程，`npm run typecheck` 通过。
- **T6**　独立子 Agent 评审 T4/T5 后报告 9 项问题，无阻塞，逐项核对源码后均成立：
  - `recover` 实为回滚；
  - `cleanup` 只接受 40/64 位完整提交号，原示例会被拒；
  - `--browser` 只在默认视口逐个加载入口；
  - change 分组的 `archive`/`rework` 会移动目录，`task-retry` 会改暂存区；
  - 依赖约束由 `execute` 而非 `create` 检查；
  - 原型接入参数有各自适用的命令；
  - small 只记录 merge 确认；
  - 服务测试的清理注册晚于启动 tmux；
  - `TMPDIR` 较长时 socket 路径超限，且私有 server 会加载用户 tmux 配置。

  修正上述文案与测试，并采纳两项建议：接入检查器同时核对 `groups` 导出；测试按定义解析全部 49 个命令的示例。CLI 与 Setup 测试在 Node.js 20 通过 26 项、跳过 1 项，在 Node.js 24 通过 27 项；skill 测试共 42 项。`npm run typecheck` 通过。服务测试在沙箱默认 `TMPDIR`、132 字符长 `TMPDIR` 和宿主环境下各通过一次，没有遗留会话、socket 目录或夹具目录。

## 整体验证

- `npm test` 通过 471 项，`npm run typecheck` 通过。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs .agents/skills/spec-trail/tests/*.test.mjs` 通过 41 项。
- `npm run test:e2e -- tests/browser/hosting.spec.ts -g 'skill CLI'` 通过 1 项，验证配置、构建、上传、登记和浏览器读取。测试使用 Playwright runner 的独立测试浏览器和服务夹具，以隔离管理员会话与发布数据。
- 独立评审检查命令分派、输出与退出码、Git 暂存区传播、文档和 CI 调用。修正了空命令被当作帮助及归档标签删除的必填选项提示。两项修正均通过 Node.js 20/24 CLI 回归，标签维护通过本地远端复测。
