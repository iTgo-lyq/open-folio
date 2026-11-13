# SpecTrail 脚本收敛为统一命令行入口

## 目标

SpecTrail 的命令分散在多个脚本文件里，Agent 需要查找各自的路径和参数写法。为 Agent 和自动化提供统一入口，便于发现各组命令并直接解析操作结果。

## 现状

skill 文档与参考文档目前引用的入口包括：

| 领域 | 当前入口 | 用法示例 |
| --- | --- | --- |
| 状态命令 | `scripts/change.mjs` | `create`、`task-start`、`task-complete`、`execute`、`verify` 等 |
| 工作区 | `scripts/workspace.mjs` | `handoff`、`locate`、`prepare` |
| 集成 | `scripts/integration.mjs` | `preflight`、`verify`、`cleanup` |
| 分享链接 | `scripts/share.mjs` | `--change <id>` |
| 项目接入与自动化 | `setup/scripts/check-setup.mjs`、`setup/scripts/preview-routing.mjs`、`setup/scripts/pre-commit.js`、`setup/scripts/check-pr.mjs` | 准备检查、入口预览、暂存区校验、PR 归档检查 |
| 原型 | `prototype/scripts/setup.mjs`、`publish.mjs`、`validate.mjs` | `--configure` / `--accept` / `--decline`、`prepare` / `upload` / `register`、`--browser` |
| 其他 | `scripts/version.mjs`、`scripts/retire-archive-tags.mjs` | 维护用 |

调用形式都是 `node .agents/skills/spec-trail/<目录>/<文件> ...`。有的脚本用子命令，有的用开关参数区分操作。OpenFolio 的 pre-commit hook 和归档 CI 直接调用旧路径，接入文档和可复制的 CI 模板也使用这些路径。状态、工作区、集成和分享命令已使用 JSON，部分原型操作使用文本。

## 范围

- **入口（需求 Q1）**　随项目内 skill 分发，统一通过 `node .agents/skills/spec-trail/cli.mjs` 调用。按领域提供 Change 状态、工作区、集成、分享、项目接入、原型和维护命令，统一参数风格，并提供总帮助、分组帮助和命令帮助。
- **帮助一次给全**　验收时用户要求帮助尽量一次到位，避免 Agent 反复查找。总帮助列出全部命令的用途和可直接运行的完整用法，包括固定取值和值格式；分组帮助补充约束说明；命令帮助说明每个参数的含义、取值、约束并给出示例。固定取值不合法时，入口先报错并列出可选值。
- **调用方（需求 Q2）**　将主 skill、子 skill、参考文档、OpenFolio 的 hook、归档 CI 和接入模板切换到统一入口。历史调用兼容移出本次范围，现有工作流操作、状态与校验语义继续沿用。提交钩子丢弃成功时的 JSON 结果，人工提交只在拒绝时看到 `stderr` 诊断。
- **输出（需求 Q3）**　操作结果默认以 JSON 写入 `stdout`，诊断写入 `stderr`，供 Agent 和自动化消费。
- **服务管理测试**　用户在验收时要求一并修复。`tests/service-tools.test.ts` 当前与开发者默认的 tmux server 共用：机器上已有沙箱外启动的 tmux server 时，测试服务运行在另一个网络命名空间，就绪检查失败。测试改用独立的 tmux server，不在用户默认 server 上创建会话，`scripts/service.mjs` 的行为不变。

## 验收

- 按文档安装 skill 后即可通过固定路径调用。总帮助、分组帮助和命令帮助可在任意目录通过入口文件的绝对路径查看，无需读取项目配置。总帮助列出每个命令的用途，以及包含必填参数、固定取值和值格式的完整用法；命令帮助逐项说明参数并给出示例。每个命令的每个参数都有说明。
- 未知命令、未知参数、缺少必填参数和固定取值不合法均返回非零退出码，诊断提示对应的正确用法，取值错误时列出可选值。默认操作结果的 `stdout` 可直接作为一个 JSON 值解析。
- 从统一入口执行有代表性的只读操作、状态写入和原型操作，验证其业务结果。检查当前文档示例、hook、归档 CI 和接入模板均调用统一入口，并用实际提交和 PR 校验覆盖允许和拒绝两类结果。通过 hook 成功提交时没有 SpecTrail 的 `stdout` 输出，拒绝时 `stderr` 给出原因。
- 机器上存在共享 tmux server 时，开发机沙箱内运行 `tests/service-tools.test.ts` 通过，且测试结束后用户默认 tmux server 上没有遗留的测试会话。
