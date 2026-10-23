# 执行证据

## T1：发布可重复执行的 skill 版本

现有同步脚本从导出的固定提交加载版本工具，先验证已有版本，再保留生成的 version.json 同步正文。首次建立 0.1.0 基线，内容变化才递增补丁号，版本和内容一起提交。发布校验同时运行 setup 与 skill 自包含测试；源工作区不生成版本文件。

验证：

- `node --conditions=react-server --test tests/skill-sync.test.ts .agents/skills/spec-trail/tests/version.test.mjs`：10 项通过。覆盖版本数值比较、首版、重复与无关提交不加版本、非法已有版本、保留 LICENSE、失败推送的新 checkout 重试及新增自包含测试失败阻止发布。
- `node --test .agents/skills/spec-trail/tests/version.test.mjs .agents/skills/spec-trail/setup/tests/setup.test.mjs`：14 项通过；后续仅补充版本空白字符边界和发布自包含测试的失败场景，已由上一组重新覆盖。
- `git diff --check`：通过。

发布测试仅使用临时本地 Git 仓库和 bare remote，没有运行真实发布 CI 或向公开仓库发布版本。
