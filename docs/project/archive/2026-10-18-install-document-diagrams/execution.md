# 安装与验证

通过 skill-installer 安装 `iTgo-lyq/document-diagrams` 的 `skills/document-diagrams/`，源提交为 `7ce69eb2a11cde41dd3c497e4f3be2767036334c`。完整目录位于 `.agents/skills/document-diagrams/`，采用项目级安装并随仓库交付，保留原始许可与所有配套资源。

- 来源一致性：83 个文件的 Git blob 哈希全部与固定源提交一致，没有软链接或外部源码目录依赖。
- `python3 /home/tiger/workspace/document-diagrams/scripts/check.py --skill-dir .agents/skills/document-diagrams`：安装边界与全部内部引用通过；检查器来自同一源提交，仅安装时使用。
- skill-creator 的 `quick_validate.py`：skill 元数据格式通过。
- 24 个 Python 文件通过 AST 语法解析，不生成缓存文件。

本次为现有发布包的安装，不修改绘图规则和应用代码。校验验证安装完整性，不代表执行过绘图或视觉验收。
