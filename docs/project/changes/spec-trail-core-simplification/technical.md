# 技术方案

基于 [需求](requirement.md)。本 Change 按用户逐项指示实施，方案在实施后补记，记录已采用的结构与取舍。

## 文档结构

- `SKILL.md` 是唯一的 skill 入口，覆盖接收任务、规划与返工；执行、关闭、合入、清理与正式发布放在 `references/delivery/delivery.md`，进入 execution 后读取。返工回到规划阶段时直接使用 `SKILL.md`，不必再找其他文件。
- 接入、原型说明分别放在 `references/setup/`、`references/prototype/`，不再标记为独立 skill；对应命令只在各自说明中出现。
- 正文不复述脚本已经保证的检查，只写需要 Agent 判断的规则；脚本不检查的事项（如原型验收）明确由 Agent 把关。需求澄清与技术问询共用「提问」一章，两类问题的范围和额度分开。

## CLI 与代码结构

- `cli.mjs` 只解析参数、输出三层帮助并分发。命令组由注册表 `scripts/commands.mjs` 声明，按需加载；setup、prototype 为隐藏组，Node.js 版本要求由组自行声明。
- 命令用 `define()` 声明参数、帮助与示例。状态命令经 `scripts/state/context.mjs` 统一完成定位、加锁、打开、执行、不变量检查和写回；共用前置检查在 `guards.mjs`，每个命令组一个文件。
- 四份状态锁合并为 `scripts/core/lock.mjs`，锁位于 Git common-dir 下的 `spec-trail-state.lock`，附 `owner.json` 记录持有者。
- 主流程对原型的调用只经过 `scripts/prototype/hooks.mjs`，字段校验直接使用 `contract.mjs`。
- Skill 脚本的依赖扫描改为 Skill 测试，pre-commit 不再检查；扫描器随测试放在 `tests/`。

## 原型

- 输出单位是业务页面片段。本次 Change 的界面在原型阶段直接写进业务代码，原型包按源码路径或已有别名跨包引用，mock 放在数据边界；原型阶段代码允许简陋，实现时按正式标准重新优化。
- 构建沿用业务仓库的工具链，只约定产物：托管为 `dist/<id>/index.html`，Git 兜底为 `preview/<id>/index.html`。`prototype accept` 只生成包文件并保持 pending，`prototype enable` 要求有 build 脚本。
- 原型与实现共用代码后，删除逐项样式比对的还原验收，改为执行与关闭时的原型核对。

## 兼容与影响

- 旧命令名不保留别名，`maintenance` 组和版本检查删除；`checkForUpdates` 在 CLI、hook 和工作台都按未知字段拒绝。`workspace locate` 的输出把 `session` 改为 `next`。
- hook 与 PR CI 的调用入口 `setup pre-commit`、`setup check-pr` 不变，已接入项目无需修改。`change.json`、`workflow.json`、`prototype.json` 的结构不变。
- 服务端只调整原型脚本的引用路径和 `checkForUpdates` 校验，合入后按项目约定更新常驻服务。

## 验证

`npm test`、Skill 测试、`packages/prototype` 测试、原型托管浏览器测试、类型检查、`setup check`、介绍站检查，以及 Skill 与文档的本地链接检查。
