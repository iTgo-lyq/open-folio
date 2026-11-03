# 同步 document-diagrams 最新技术图规范

项目级技能来自 `iTgo-lyq/document-diagrams` 的 `50da067c2740a7e730932b6f76dae9376de171ca`。用户要求检查并同步更新，随后明确要求“提交推送吧。合入 main”。本次已核实上游 `main` 为 [`49dcf3e8195a37960aaba77501cea502076b3a44`](https://github.com/iTgo-lyq/document-diagrams/commit/49dcf3e8195a37960aaba77501cea502076b3a44)；原有 83 个文件与旧源提交一致，没有本地定制。

完整同步固定提交中的 `skills/document-diagrams/` 到项目 `.agents/skills/document-diagrams/`，包括删除上游已移除的文件。新版按项目材料绘制静态 SVG，技术图以实际可读性决定分区和拆图，保留关键组件、条件与关系；移除 draw.io、Mermaid、Excalidraw 导入流程及解析脚本。保留 45 种图形、检查工具、模板、展示信息和 MIT 许可。

这是单个外部技能目录的机械同步，按 small 推进。通过 skill-installer 下载固定提交，核对后替换项目副本；维护工具、测试与源码依赖不进入安装目录。前轮已在本地完成同步和验证，本轮补齐交付记录，在独立工作分支提交，通过 PR 交付到 develop，再按用户授权通过发布 PR 普通合并至 main。不修改 OpenFolio 应用或 SpecTrail 技能内容，不递增其版本，不需要服务构建或重启。

验收依据：77 个安装文件与固定上游逐字节一致，旧导入文件无残留；安装边界和内部引用检查通过；21 个 Python 文件语法有效；同一源提交的安装、运行和配色回归指向项目副本，全部 30 项通过。本次无需新增绘图或模型测试。
