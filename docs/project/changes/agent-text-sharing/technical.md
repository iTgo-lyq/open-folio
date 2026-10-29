# Agent 文本读取方案

## 实现

新增 `/share/agent` Route Handler，仅支持 GET/HEAD。参数沿用 repository、change、integrationBranch，可用 document 指定 Change 内相对文档路径，snapshot 固定快照，refresh=1 显式检查更新。响应以 `text/plain; charset=utf-8` 承载 Markdown，浏览器及 HTTP 客户端都能直接查看文本。失败保留 HTTP 状态并返回文字错误，继承 no-store、nosniff、no-referrer 和 noindex。

在现有分享读取协调器内增加文本分支，继续通过 readSharedTarget 选取可读来源并调用 projectChange 白名单投影。只读取 primaryRecord 指向的权威材料；正文从同一 SnapshotStore 快照取得，交付前复查快照与来源授权。沿用现有远端权限有效期和刷新合并，不引入存储、分享凭证或新的授权系统。

文本由确定性渲染器组装：项目与 Change 元信息、来源、流程 JSON 的可公开字段、文档目录、按需求/技术/计划/调查/执行/评审及相对路径排序的原文、附件与原型引用。状态只使用既有公开投影，保留 change.json 分篇入口。每篇标明相对路径、分支与提交。Markdown 链接通过现有解析依赖取得源码位置并仅改写链接目标，保留正文格式、代码块和引用式链接；允许范围内的文档及图片转换为绝对分享 URL，外部 HTTPS 链接保留，范围外材料保留文字说明。

汇总正文默认上限为 512 KiB，超过时仅返回元信息、完整目录及附件引用，并明确没有包含材料正文；单篇请求完整返回原文，仍受现有采集单文档限制。目录和内部引用携带当前 snapshot，版本变化返回可读冲突，提示重新读取入口。相对 document 参数经白名单匹配，不接受任意 Git ref 或仓库路径。

复制入口使用同一 ShareTarget 构造独立 URL helper，由 Astra 负责弹层文案与布局，复用现有组件和主题。正文接口、URL helper 与复制入口不变更持久数据格式。

## 简化与验证

保留现有快照与来源检查：它们防止跨 Change 越界、混合版本及失权后的内容交付。合并读取、错误映射及保护响应头到已有分享协调器。新增的只有文本投影、路由与复制入口，无需新建分享记录、内容摘要服务或 Agent 协议。

测试覆盖匿名全文与单篇、状态和澄清、Markdown 链接、代码块保留、超大材料目录降级、参数越界、失权及快照竞争、GET/HEAD 和错误格式。前端通过已有浏览器 fixture 检查双复制入口和失败降级，使用常驻 CDP Chrome 验收桌面及窄屏，完成类型检查和生产构建。medium 交付进行独立评审，最终等待用户验收后按流程归档合入。
