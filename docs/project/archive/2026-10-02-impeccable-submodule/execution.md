# 执行记录

## T1：创建个人 fork 并以固定提交子模块接入当前项目

- GitHub fork：[iTgo-lyq/impeccable](https://github.com/iTgo-lyq/impeccable)。通过 GitHub API 确认 `fork: true`、`parent.full_name: pbakaus/impeccable`、默认分支 `main`。
- 子模块：`vendor/impeccable`；`.gitmodules` 使用 fork 的 HTTPS URL；父仓库索引为 mode `160000`，固定提交 `508d7e8955de3b3caf2d8676e85206723d41a887`（`skill-v4.5.0`）。
- 查询 fork 和 upstream 的 `refs/heads/main` 均返回该提交。本地子模块处于 detached HEAD，`origin` 指向 fork，`upstream` 指向上游；工作区干净。
- 临时创建独立父仓库，只登记相同 `.gitmodules` 和 gitlink，执行 `git submodule update --init --recursive`，直接从 fork 成功取得同一提交。检查子模块干净，`LICENSE`、`NOTICE.md` 及 Live 源码存在；验证目录随后清理。
- `npm run typecheck`、`npm run format:check`、`git diff --check` 和暂存区 diff 检查均通过。使用 TypeScript API 解析父配置，确认文件清单包含 43 个父项目文件和应用入口，Impeccable 文件为 0。
- README 记录初始化、需要时添加本地 upstream、先推送子模块补丁再更新父仓库指针的方式。

此次没有修改上游源码、安装其依赖或运行其脚本，未验证 Live / Agent 接入。没有应用行为变更，因此未重复应用浏览器测试或构建。
