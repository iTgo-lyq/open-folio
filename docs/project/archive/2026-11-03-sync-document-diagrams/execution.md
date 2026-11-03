# T1：同步技能源码与验证

通过 skill-installer 下载 `iTgo-lyq/document-diagrams` 的固定提交 `49dcf3e8195a37960aaba77501cea502076b3a44`，完整替换项目安装副本。前轮已完成本地同步，本轮将同一已验证快照转移到独立交付工作区，补齐归档和 PR 交付。相对旧安装共更新 30 个文件，保留全部 77 个安装文件，删除 3 份导入说明和 3 个解析脚本；未混入上游维护工具或测试。

验收证据：

- 对照固定源提交的 Git 文件清单和 blob：77 个文件逐字节一致，无额外文件；原安装与旧提交一致，没有本地定制。
- 同一源提交的 `scripts/check.py` 对交付副本检查安装边界和全部本地引用，通过。
- 21 个 Python 文件通过 `ast.parse` 语法检查。
- 使用同一源提交的 `tests/test_installation.py`、`tests/test_runtime.py` 和 `tests/test_color_semantics.py`，将 `SKILL` / `SCRIPTS` 指向交付副本，在 `PYTHONDONTWRITEBYTECODE=1` 下运行：30 项全部通过。覆盖 45 种图形路由、独立安装、引用越界与缺失资源、SVG 可访问性和几何、较大架构图及差异图的结构语义、语义配色、焦点与数量编码。
- `git diff --check` 通过。Agent 自查确认技能差异与上游一致，其他差异仅为本 Change 材料。

OpenFolio 应用实现和 SpecTrail 分发内容没有变化，不改版本，不需要应用构建、模型测试、绘图视觉验收或长期服务重启；Specs 无需更新。用户明确要求提交、推送并合入 main，交付依次使用 Change PR 和发布 PR 普通合并。
