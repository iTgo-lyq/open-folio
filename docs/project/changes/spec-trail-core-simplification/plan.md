# 计划

基于 [需求](requirement.md) 与 [技术方案](technical.md)。任务按用户逐项指示依次实施，计划在实施后补记，按默认编号顺序执行。

## T1 整理主 Skill 与接入入口

- 交付：主 Skill 按工作流重排；接入说明归入 `references/setup/`，项目入口声明接入；删除 Skill、文档与介绍站中的许可描述。
- 验收：主 Skill 不含接入检查，接入说明给出入口声明写法；仓库中无许可文件与许可描述。
- 验证：Skill 测试、`setup check`、介绍站检查。

## T2 CLI 分层帮助与命令分组

- 交付：三层帮助；状态命令分为 change、clarify、task、stage、close 五组；setup、prototype 隐藏；删除 maintenance 组与版本检查。
- 验收：`cli --help` 只列八个日常命令组，组帮助与命令帮助层层展开；含 `checkForUpdates` 的配置被拒绝。
- 验证：CLI 帮助测试与状态命令回归测试。

## T3 CLI 代码结构与测试收敛

- 交付：注册表与按需加载、`define()` 命令定义、`scripts/state` 生命周期与共用检查、统一状态锁、原型 hooks 接口；删除简单校验测试并合并重叠场景。
- 验收：hook、PR CI 与日常状态命令行为不变。
- 验证：`npm test`、Skill 测试、类型检查。

## T4 原型改为业务页面片段

- 交付：原型说明改为业务页面片段、跨包引用与多页面静态构建；`prototype accept` 不再生成 HTML 脚手架，`enable` 要求 build 脚本；原型说明移入 `references/prototype/`。
- 验收：空目录 accept 后为 pending，补上 build 脚本后 enable 成功；发布、登记、Git 兜底与归档照常可用。
- 验证：原型工具与发布测试、`packages/prototype` 测试、原型托管浏览器测试。

## T5 脚本依赖检查移到 Skill 测试

- 交付：pre-commit 与 `setup check` 不再检查脚本依赖，Skill 测试扫描 Skill 内全部脚本。
- 验收：扫描覆盖全部 Skill 脚本，原有识别用例保留。
- 验证：Skill 测试、`setup check`。

## T6 按阶段拆分主 Skill

- 交付：`SKILL.md` 保留公共与规划部分，执行与交付拆到 `references/delivery/delivery.md`；共用提问规则；删去复述脚本检查的文字；原型阶段代码与原型核对；worktree 中继续工作，不再要求切换会话。
- 验收：阅读路线与阶段表指向正确章节，Skill 与文档链接有效。
- 验证：`npm test`、Skill 测试、本地链接检查、介绍站检查。

## 整体验证

合入前在工作分支运行 `npm test`、Skill 测试、类型检查、`setup check` 与介绍站检查；合入后更新常驻服务并做冒烟检查。
