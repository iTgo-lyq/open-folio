---
name: spec-trail-setup
description: 首次在 Git 仓库持久化接入 SpecTrail 时，登记守护分支并安装无第三方依赖的提交前规则校验 hook。用于初始化或更新接入；常规 Change 推进使用主 SpecTrail skill。
---

# 接入 SpecTrail

接入结果必须进入版本控制：守护分支配置、只负责调用脚本的 `pre-commit` hook，以及 skill 目录中的校验脚本随仓库交付。本机 Git 配置不提交；只在 `.git/hooks` 安装不算完成接入。

校验使用 Node.js 内置模块和 Git，不安装依赖，不创建或修改项目包配置，不添加 `prepare`、`spec-trail:check` 或其他 npm 脚本。

## 安装

1. 确认目标 Git 仓库、默认分支、实际保护规则及现有 hook 配置。按主工作流的 `WorkflowConfig` 在 `docs/project/workflow.json` 登记实际守护分支，保留已有有效配置。没有 remote 时登记本地约定并说明尚无服务端保护。需要 Node.js 20+ 和 Git。
2. 从任意目录运行，`<setup-dir>` 指本文件所在目录：

   ```bash
   node <setup-dir>/scripts/install-hook.mjs <repo-dir>
   ```

   安装器确保 [无依赖校验脚本](scripts/pre-commit.js) 位于 `.agents/skills/spec-trail/setup/scripts/pre-commit.js`，并创建可执行的 `.githooks/pre-commit`。hook 只调用该脚本，校验逻辑统一在脚本中维护。没有现有 hook 配置时，本机设置 `core.hooksPath=.githooks`；重复接入保留同一入口。无需安装器副本、额外运行时目录或下载步骤。
3. 若安装器报告 `INTEGRATION_REQUIRED`（退出码 2），读取现有 hook 和管理器配置，保留全部现有逻辑与 `core.hooksPath`，在同一个有效的 `pre-commit` 中追加安装器输出的校验脚本调用；已有调用不重复添加。校验须位于会修改暂存区的步骤之后，并传递失败退出码，不能放在提前退出的代码之后。接入代码须持久化到仓库，不通过修改包配置接入。更新已由 SpecTrail 独占的 hook 或校验脚本时核对内容后替换；不要覆盖用户追加的检查，也不将校验逻辑复制到 hook 中。
4. Git clone 传递 hook 和校验脚本，不传递本机的 `core.hooksPath`。新克隆在没有其他 hook 配置时执行以下命令即可启用；已有 hook 管理器沿用其实际路径。同仓库 worktree 共用 Git 配置，从各自检出的 hook 调用本工作区的校验脚本。

   ```bash
   git config --local core.hooksPath .githooks
   ```

5. 手动执行 `node .agents/skills/spec-trail/setup/scripts/pre-commit.js` 并运行有效 hook，核对权限、调用路径及错误退出码。修改规则或安装器后运行 `node --test <setup-dir>/tests/setup.test.mjs`，验证真实提交、字段规则、暂存区与部分提交、克隆后的启用、已有 hook 和 worktree；不在用户工作区制造无效状态文件。没有目标文件时如实说明“本次无待校验文件”。
6. 将守护分支配置、hook 和校验脚本的接入文件提交，按已有授权与 remote 配置推送。报告持久化位置、本机启用方式、验证及提交推送状态。未提交、未启用或未推送时不宣称相应步骤已完成。项目 README 只保留项目目标，接入规则统一维护在本 skill。

## 校验范围

- 只检查暂存区中本次新增、修改的 `docs/project/workflow.json`、`docs/project/changes/<id>/change.json` 和 `docs/project/archive/<date>-<id>/change.json`。重命名按目标文件检查，删除和未改动的历史文件不检查。
- 按主 skill 的 TypeScript 声明检查必需字段、类型、枚举、非空文本、带时区的有效时间、任务编号、未知字段及数组重复项，包含 `dependsOn`。
- 只保留明确的字段关联：`blocked` 任务需要 `reason`，`cancelled` Change 需要 `cancellation`。
- 读取 Git 本次实际提交的暂存区版本，保留 `GIT_INDEX_FILE`。失败输出文件、字段和原因并阻止提交；不修改文件或暂存区。
- 确认是否有效、依赖是否满足、任务是否真正完成以及合码条件由 Agent 按主工作流判断。hook 不解析 Markdown，也不增加开发、归档或合码门禁。

更新规则时只修改 skill 中的校验脚本并提交对应更新，使规则与主 skill 的类型声明保持一致；hook 保持对该脚本的调用。
