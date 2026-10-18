# T1：同步技能源码与验证

从 `iTgo-lyq/document-diagrams` 的 `main` 获取最新提交 `50da067c2740a7e730932b6f76dae9376de171ca`，使用 skill-installer 的 `install-skill-from-github.py --repo iTgo-lyq/document-diagrams --path skills/document-diagrams --ref 50da067c2740a7e730932b6f76dae9376de171ca --dest <临时目录>` 下载，再将完整目录同步到项目 `.agents/skills/document-diagrams/`。本次更新 52 个文件，保留全部 83 个安装文件；原有副本没有本地定制。

## 验证结果

- 对照固定源提交的 Git 文件清单和 blob：83 个文件全部一致，未引入额外文件。
- `python3 /home/tiger/workspace/document-diagrams/scripts/check.py --skill-dir .agents/skills/document-diagrams`：安装边界和全部内部引用通过；检查器来自同一源提交，仅验证时使用。
- 24 个 Python 文件通过 `ast.parse` 语法检查，未写入字节码缓存。
- 使用同一源提交的 `tests/test_color_semantics.py` 与 `tests/test_runtime.py`，分别将 `SCRIPTS`、`SKILL` 指向更新后的项目副本，通过 unittest 运行全部 21 项测试。覆盖显式焦点、多节点语义配色、热力图数值标尺、瀑布图增减与对比度、SVG 模板和导入工具等；全部通过。运行时设置 `PYTHONDONTWRITEBYTECODE=1`，测试及维护文件不随技能交付。
- `git diff --check` 通过。Agent 自查确认差异仅含上游技能更新和本 Change 文档。

产品行为与长期服务代码没有变化，Specs 无需更新，不执行应用构建或服务重启。本次验证安装与现有工具行为，未新增绘图或进行视觉验收。
