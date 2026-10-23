# 执行证据

## T1：发布可重复执行的 skill 版本

现有同步脚本从导出的固定提交加载版本工具，先验证已有版本，再保留生成的 version.json 同步正文。首次建立 0.1.0 基线，内容变化才递增补丁号，版本和内容一起提交。发布校验同时运行 setup 与 skill 自包含测试；源工作区不生成版本文件。

验证：

- `node --conditions=react-server --test tests/skill-sync.test.ts .agents/skills/spec-trail/tests/version.test.mjs`：10 项通过。覆盖版本数值比较、首版、重复与无关提交不加版本、非法已有版本、保留 LICENSE、失败推送的新 checkout 重试及新增自包含测试失败阻止发布。
- `node --test .agents/skills/spec-trail/tests/version.test.mjs .agents/skills/spec-trail/setup/tests/setup.test.mjs`：14 项通过；后续仅补充版本空白字符边界和发布自包含测试的失败场景，已由上一组重新覆盖。
- `git diff --check`：通过。

发布测试仅使用临时本地 Git 仓库和 bare remote，没有运行真实发布 CI 或向公开仓库发布版本。

## T2：按项目配置检查并提醒 skill 更新

仅在 change CLI 成功输出层接入检查，在状态操作结束与锁释放后追加外层提示。项目可用 checkForUpdates 关闭；版本取自实际安装，结果缓存在 Git common-dir，失败和未知不改变原操作结果。skill 与 OpenFolio 配置校验同时接受布尔开关，配套说明包含旧安装首次手动更新、开发副本无版本、缓存和关闭行为。

验证：

- `node --test .agents/skills/spec-trail/tests/*.test.mjs`：15 项通过，其中更新检查 13 项、版本 2 项。覆盖同一安装访问不同项目、--repo 与子目录、worktree 共享缓存、关闭零更新请求、锁释放后检查、预览与失败跳过、网络失败保持状态写入和退出码，以及响应体超时、超限取消、非法/不可写缓存。
- `node --conditions=react-server --test tests/state-commands.test.ts tests/routing.test.ts tests/prototype-contract.test.ts`：28 项通过；`node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：12 项通过。
- `npm test`：325 项通过；`npm run typecheck` 与 `npm run format:check` 通过。
- `npm run build`：任务 worktree 的 `.next` 构建通过，构建前本目录无既有产物或运行实例；没有覆盖长期服务产物。
- `git diff --check`：通过。

独立评审由隔离上下文 subagent 完成，覆盖整个实现、需求对应、发布与重试、唯一入口、关闭与异常语义、缓存及配置兼容，未发现可操作缺陷。评审只读，没有修改实现或重复运行全量测试；其测试结论依据上述实际执行结果。

验证后正常合并最新 develop 的四个提交，变化仅在其他 Change 的规划材料与原型资源，没有修改本次实现或生产源码；没有冲突。同步后检查本次差异与空白，保留上述有效验证结果。

验证限制：没有触发真实公开发布或部署长期服务。当前官方元数据将在后续正式 main 发布时生成；首次接入旧安装仍需手动更新。长期服务按项目约定在验收、归档与集成后更新，保留当前用户数据。
