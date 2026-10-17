# 项目安装文档绘图 skill

## 背景与目标

OpenFolio 的 setup 已支持询问安装 document-diagrams，但本项目尚未安装。将该 skill 纳入项目版本控制，便于仓库 Agent 在后续需求和技术文档中按需绘图。

## 范围与方案

从 `iTgo-lyq/document-diagrams` 当前 main 的固定提交安装完整 `skills/document-diagrams/`，保存到 `.agents/skills/document-diagrams/`。保留入口、参考资料、工具、模板及许可原文，不修改分发内容。安装为项目级，随 Git clone 可用，不依赖本机其他源码目录。应用行为无变化。

使用 skill-installer 的 GitHub 安装工具指定源提交与项目目录，核对来源文件一致性、安装包完整性和内部引用。完成后提交并推送 main，清理临时分支，继续只保留一个主工作区和 main 分支。

## 验收标准

- 项目 skill 入口可发现，全部发布文件和许可齐全，没有指向其他工作区的软链接。
- 安装包完整性与引用检查通过，所安装文件与固定源提交一致。
- 安装内容提交到 main，本地与远端同步，工作区干净且无遗留临时分支。
