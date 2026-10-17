# 文档绘图接入与 SVG 阅读支持

## 背景与目标

让需求与技术文档按需配图，并在 OpenFolio 中阅读仓库 SVG。SpecTrail 只负责提示加图时机和存放位置，具体选图与绘制交给可选的 document-diagrams skill。

## 范围与行为

- ADDED：setup 询问是否全局安装 document-diagrams；获得明确同意后执行 `npx --yes skills add iTgo-lyq/document-diagrams --skill document-diagrams --global`。拒绝、未答复或安装失败不阻塞基础接入，已安装不重复安装或升级，当前会话已有明确选择时沿用。
- MODIFIED：主 skill 的配图指引仅保留何时考虑加图、文档旁 assets 目录及 Markdown 相对引用；移除图形选型、布局、样式和绘制检查等详细规则。
- ADDED：工作台通过 Markdown 图片与图片查看器显示同提交的仓库 SVG，沿用普通文件、大小和当前连接授权检查。格式完整的 UTF-8 XML 1.0 SVG 可读取，DTD、处理指令、错误编码和伪装文件不可预览。
- SVG 资源使用独立图片上下文、固定 MIME 和 CSP 沙箱，允许图内样式，限制脚本和外部资源。格式识别不等同于内容清洗；扫描规则升级后旧缓存可在刷新时重建。

## 方案要点

保留已实现的 SVG 阅读代码、依赖、测试和产品说明。仅调整 SpecTrail 的主入口与 setup 文本，不修改只读检查器、hook 接入或 workflow 配置结构。是否全局安装由使用 setup 的用户选择，本次修改不会在当前机器执行安装。

按用户要求，将本批三份旧 Change 及对应十个提交整合成这一份 Change 和一个提交。先由 iclaude 独立验收，再交用户确认；确认前保持 main 不变，不提前记录用户验收或归档成功。确认后归档本 Change，并用明确旧远端提交的 force-with-lease 更新 main；若远端出现新提交，先重新核对，不能覆盖并发工作。

## 验收标准

1. setup 展示用途、全局安装范围和上述完整命令，明确同意才执行；不把安装作为基础接入的前置条件。
2. 主 skill 只描述配图时机和位置，没有图形类型表、布局/风格、SVG 绘制方法或额外绘图检查流程。
3. SVG 阅读实现、依赖、测试及文档阅读 Spec 保持有效，相关检查通过。
4. 候选历史以原十个提交之前的基线为父，只包含一个整合提交；当前树不保留三份旧 Change。
5. iclaude 验收结果可查；最终用户验收前不覆盖 main，不将 Agent 评审写成人工验收。
