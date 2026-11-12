# SpecTrail 脚本收敛为统一命令行入口

## 目标

SpecTrail 的命令分散在多个脚本文件里。Agent 和用户需要记住各自的路径和参数写法，文档也只能逐个列出调用方式。希望提供一个统一的命令行入口，使用体验接近常见 CLI：一个命令名加分组子命令，统一的帮助、参数风格、错误提示和输出格式。

## 现状

skill 文档与参考文档目前引用的入口包括：

| 领域 | 当前入口 | 用法示例 |
| --- | --- | --- |
| 状态命令 | `scripts/change.mjs` | `create`、`task-start`、`task-complete`、`execute`、`verify` 等 |
| 工作区 | `scripts/workspace.mjs` | `handoff`、`locate`、`prepare` |
| 集成 | `scripts/integration.mjs` | `preflight`、`verify`、`cleanup` |
| 分享链接 | `scripts/share.mjs` | `--change <id>` |
| 接入检查 | `setup/scripts/check-setup.mjs`、`setup/scripts/check-pr.mjs` | 无子命令 |
| 原型 | `prototype/scripts/setup.mjs`、`publish.mjs`、`validate.mjs` | `--configure` / `--accept` / `--decline`、`prepare` / `upload` / `register`、`--browser` |
| 其他 | `scripts/version.mjs`、`scripts/retire-archive-tags.mjs` | 维护用 |

调用形式都是 `node .agents/skills/spec-trail/<目录>/<文件> ...`。有的脚本用子命令，有的用开关参数区分操作。pre-commit hook 和 PR CI 模板也直接引用其中的脚本。

## 范围（初步）

- 新增统一入口，按领域分组提供现有命令，支持总帮助和每个子命令的帮助。
- skill、子 skill 与参考文档改为引用统一入口。
- 现有脚本的功能和状态校验规则不变，只调整入口与调用体验。

## 未决问题

- 命令名与调用方式：继续用 `node <路径>` 调用单一入口文件，还是提供可执行命令（如 npm bin）。
- 旧脚本路径是否保留为兼容入口、保留多久；已安装旧版本 skill 的项目如何过渡。
- pre-commit hook 与 PR CI 模板是否也改走统一入口。
- 输出是否统一为 JSON，或区分面向人的输出与面向 Agent 的结构化输出。
- 规模暂定 medium（改变 Agent、hook 与 CI 共同依赖的命令接口），恢复后按方案复核。

## 暂缓

用户要求先记录需求，等 SpecTrail skill 文档清理完成后再启动。
