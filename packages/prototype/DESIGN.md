# OpenFolio 原型设计依据

以 [项目前端约定](../../AGENTS.md) 和 [共享 UI 样式](../ui/src/styles.css) 为权威来源：延续雾蓝背景、深蓝操作色、细边框与低对比辅助文字。包内共享样式仅摘取这些基础规则用于离线样例；产品设计规则变更先更新主应用，再同步这里。

本包展示原型交付能力，用静态 HTML 与内存 mock 表达布局；没有复制 React 业务组件，也不代表新的业务功能已接入。两个页面复用 shared/header.html、shared/style.css 和同一品牌素材，组件复用同一套样式。原生系统字体不需要网络请求。

`change-overview` 与 `empty-state` 覆盖 PC Web、iPad、移动设备；`preview-toolbar` 是 640×320 CSS px 的局部组件。交互状态仅在当前页面内保存。
