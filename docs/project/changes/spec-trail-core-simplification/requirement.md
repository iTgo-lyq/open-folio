# 精简 SpecTrail 主 Skill 与 CLI，原型改为复用业务代码的页面片段

## 目标

减少 Agent 推进 Change 时需要读的规则和命令帮助，让项目接入、日常操作和仓库维护各有清晰入口，并理清 CLI 的代码结构。本次范围是主 Skill、接入说明、CLI 及其测试，以及原型的制作方式。

原型方面，实际使用中独立维护的 HTML 原型与业务代码脱节，原型和实现要各写一遍。改为原型包直接复用业务组件，按业务仓库自己的技术栈构建成多个静态页，仍可静态上传和记录。

本 Change 由用户逐项指定改进内容并确认，不按常规的分轮澄清推进；需求确认与分支移交在内容基本完成后补记。

## 范围与行为

### 文档与接入

- 主 `SKILL.md` 按工作流重排，合并原来分散的状态、工作区、集成和分享说明，本次保持单个文件。
- 主 Skill 不再提接入检查。项目接入后，在 `AGENTS.md` 或项目实际使用的 Agent 入口里声明本仓库遵循 spec-trail skill，后续会话读到入口即可知道已接入；本仓库的 `AGENTS.md` 已加上这句声明。未接入的仓库运行日常命令时，提示按接入说明完成接入。
- 接入说明和模板归入 `references/setup/`，原型说明、模板和适配器示例归入 `references/prototype/`，两者都不再标记为独立 skill，Skill 内只保留主 `SKILL.md` 一个入口。setup 和 prototype 命令只在各自说明里出现。Git hook 和 PR CI 仍调用 `setup pre-commit`、`setup check-pr`，已接入的项目无需修改。
- Skill 只供用户自己使用：删除 Skill、文档和介绍站中的许可文件与许可描述；`packages/ui` 里第三方组件的来源注释保留。

### CLI

- 帮助分三层：`cli --help` 只列命令组，`cli <group> --help` 列出组内命令，`cli <group> <command> --help` 才给出参数和示例。
- 状态命令按职责分为 `change`、`clarify`、`task`、`stage`、`close` 五组，例如 `task start`、`stage execute`、`close archive`，不保留旧命令名。`change previews-set` 改为 `prototype previews`。只读的 `change show` 去掉 `--dry-run`。
- setup 和 prototype 是隐藏组，总帮助里不显示，用法分别见接入说明和原型说明；Node.js 24 的要求由 prototype 组自己声明。
- 删除 `maintenance` 组，包括 `version-next` 和旧归档标签清理工具。版本号改为手动维护，`version.json`、`package.json`、`package-lock.json` 三处保持一致。
- 删除 Skill 自动版本检查及其提示和缓存。CLI、hook 和工作台都把 `checkForUpdates` 当作未知字段，现行文档和介绍站里的更新引导一并移除。

### 代码结构

- `cli.mjs` 只负责解析参数、输出分层帮助和分发命令。命令组由注册表 `scripts/commands.mjs` 列出，用到哪个组才加载哪个组。
- 共享基础模块放在 `scripts/core/`。状态命令放在 `scripts/state/`：`context.mjs` 负责定位 Change、加锁打开、校验和写回，`guards.mjs` 放各命令共用的前置检查，每个命令组一个文件，命令定义和实现放在一起。setup 的定义和脚本放在 `scripts/setup/`，原型的放在 `scripts/prototype/`。
- 原型命令由 `scripts/prototype/commands.mjs` 定义。主流程对原型的调用（校验预览、归档时固定、返工时还原、合入时核验，以及提交时的原型检查）都经过 `scripts/prototype/hooks.mjs`；字段校验仍直接使用原型的 `contract.mjs`。
- 原来四份状态锁实现合并为 `scripts/core/lock.mjs`。

### 原型

- 原型的输出单位是业务页面片段，不是传统意义上的组件：一个清单入口对应真实业务页面中有完整业务含义的一块，例如页面框架、业务大表单、列表区、详情抽屉。原子组件归组件库预览，完整应用不是原型目标。片段范围由本次 Change 影响的界面决定。
- 保留独立原型包。片段优先直接跨包引用业务组件，按源码路径或业务仓库已有的别名引用，业务仓库不为原型新增导出、入口或配置；mock 放在数据边界，组件内部取数时由原型构建替换数据请求、路由和服务端模块。引用需要大改业务仓库时，在原型包内轻量实现。
- 对业务仓库的修改保持克制。业务代码本身应适合被引用：展示与取数分开，数据边界集中，导入无副作用；既有代码不满足时不为原型重构。
- 构建沿用业务仓库的技术栈和配置，SpecTrail 不提供或推荐脚手架。原型包的 build 脚本按多页面静态构建输出，每个入口一个静态页：托管为 `dist/<id>/index.html`，Git 兜底保留为自包含的 `preview/<id>/index.html`。
- `prototype accept` 不再复制 HTML 拼接脚手架、不再构建示例页：空目录只生成 package.json、.gitignore、空清单、AGENTS 和 DESIGN，接入保持 pending；补上 build 脚本后运行 `prototype enable` 完成接入，enable 要求原型包有 build 脚本。
- 清单 `kind` 的取值不变，`page` 与 `component` 都表示业务页面片段，只区分按设备展示还是按固定 viewport 展示。
- 原型说明删去与主 Skill 重复的接入状态规则、工作台实现细节、设计模板的来源说明和已停用的保留标签说明，锁与恢复说明合并为一段。

### 测试

删除只验证简单校验的测试，合并重叠的场景；保留 Git 安全、路由与移交、合入与清理、任务编号与顺序、并发和原型等复杂逻辑的测试。

## 后续

- 原型说明稳定后，另提 Change 拆分主 Skill，决定哪些内容留作必读、哪些改为按需参考。
- 本仓库 `packages/prototype` 仍是 HTML 拼接构建，迁移到新的原型方式另提 Change。

## 待定

- 需求澄清和技术问询是否共用一处提问规则。
- Skill 脚本的依赖检查是继续放在分发出去的 pre-commit 里，还是改由本仓库 CI 承担。
- 远端遗留的旧归档标签 `spec-trail/archive/change-prototype-preview` 是否删除。删除属于对外操作，需另行授权。

## 验收

- 主 Skill 不包含接入检查，接入说明给出入口声明的写法；setup 和原型命令只在各自文档中出现；Skill 内没有主 `SKILL.md` 以外的 skill 入口。
- `cli --help` 只列出八个日常命令组；组帮助列出命令，命令帮助给出参数和示例；文档、Specs 与实际命令一致。
- hook、PR CI 和日常状态命令通过回归测试；含 `checkForUpdates` 的配置在 CLI 和工作台均被拒绝。
- 仓库中的 Skill、文档和介绍站不含许可文件与许可描述。
- 原型说明写明以业务页面片段为输出单位、直接跨包引用业务代码并克制修改业务仓库、按业务技术栈多页面静态构建；Skill 中不再包含原型构建脚手架。
- 空目录 accept 后为 pending，补上 build 脚本后 enable 成功；没有 build 脚本时 enable 失败。发布、登记、Git 兜底和归档照常可用。
- `npm test`、Skill 测试、相关浏览器测试和类型检查均通过。
