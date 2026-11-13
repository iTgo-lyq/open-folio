# SpecTrail CLI 技术方案

按 [需求](requirement.md) 将 `node .agents/skills/spec-trail/cli.mjs` 作为项目内入口。CLI 负责命令发现、参数校验和输出。各领域模块继续负责 Git、状态、原型发布和校验等操作。

## 命令与参数

命令格式为 `node .agents/skills/spec-trail/cli.mjs <分组> <命令> [选项]`。

| 分组 | 命令 |
| --- | --- |
| `change` | 沿用状态命令名，包括 `show`、`execute`、`task-start`、`previews-set` |
| `workspace` | `locate`、`prepare`、`handoff` |
| `integration` | `preflight`、`verify`、`cleanup` |
| `share` | `link` |
| `setup` | `check`、`preview-routing`、`pre-commit`、`check-pr` |
| `prototype` | `accept`、`decline`、`enable`、`configure`、`validate`、`prepare`、`upload`、`register`、`associate`、`recover` |
| `maintenance` | `version-next`、`archive-tags-list`、`archive-tags-delete` |

- 用一份命令定义登记分组、命令、长参数、必填项和执行函数。总帮助、分组帮助和命令帮助均由该定义生成。保留已有参数名，接入检查的仓库位置统一用 `--repo <path>`，计算下一个版本用 `--file <path>`。原型接入动作由命令名选择，例如 `prototype configure --hosting custom`。
- 使用 Node.js 内置 `parseArgs` 严格解析该命令的参数。未知命令或参数、额外位置参数、缺少必填参数先返回用法错误，再进入仓库操作。条件组合由领域逻辑检查，帮助标注相关用法，例如原型登记需要 Git 条目或上传请求与结果，PR 归档校验接受 `--event` 或 `GITHUB_EVENT_PATH`。
- `--help` 在入口、分组或命令后均可使用。入口在参数通过校验后加载所选处理函数。非原型命令继续支持 Node.js 20+，原型操作沿用 Node.js 24+。帮助在无 Git 工作区时也可使用。

## 输出与执行

- 入口将每次操作的结果作为一个 JSON 值写入 `stdout`，保留现有结构化字段，例如 `change show` 的 `state`、`share link` 的 `url`、集成结果和接入检查的 `readiness`。将原型、提交校验和版本计算的文本结果改成结构化字段，例如条目数、验证方式、已检查文件数或下一个版本。帮助为文本，日志和诊断写入 `stderr`。原型脚手架构建的子进程输出也转到 `stderr`。
- 退出码继续表达操作结果。成功为 0，参数错误或校验失败为 1，已有清理和标签删除的部分完成场景为 2。已有的结构化失败报告可随非零退出码返回，例如接入未就绪、路由预览冲突或部分清理结果。调用方结合退出码判断，失败诊断不写进 `stdout`。
- 领域脚本改为由 CLI 调用的模块，复用现有操作函数、文件写入、锁、远端读写、失败恢复和校验。状态命令继续在原操作成功且释放锁后检查更新，沿用 `checkForUpdates` 与缓存约定。帮助与参数检查无需仓库和网络。原型发布继续使用现有上传接口及配置来源。

## 调用方切换

- 同一交付切换仓库内 CLI 调用、对外文档示例、OpenFolio 的提交钩子和 PR CI、Setup 模板及检查器建议的 hook 命令。接入检查继续只读，报告统一入口和暂存区校验所需资源。旧脚本文件中复用的业务函数可保留为模块，移除其独立命令行启动代码。
- 提交钩子沿用 Git 工作目录、`GIT_INDEX_FILE` 和退出码，归档 CI 沿用 PR 事件、令牌权限和 `SpecTrail archive` 检查名。已有项目更新 skill 时需同步替换自己维护的 hook 和 CI 调用。当前项目按完整提交交付，出现问题时按提交回退入口与调用方。

## 简化与验证

- 保留一份命令定义和现有业务边界。命令路由与帮助共用该定义，执行函数直接返回结果。移除分散的入口解析和输出代码。采用 Node 内置模块，避免额外安装步骤。历史入口兼容和面向人工操作的输出模式留在本次交付范围之外。
- 现有脚本读取已核实的风险点包括原型脚手架向 `stdout` 透传构建输出，以及 hook 在部分提交时校验 Git 提供的临时索引。用临时 Git 仓库分别覆盖原型初始化的 JSON 输出，以及普通提交、拒绝提交和部分提交。用现有 PR 事件夹具验证活动 Change 被拒绝、有效归档通过。验证调用路径、参数及输出的完整安排见 [Plan](plan.md)。
