# 原型预览评审记录

## 范围与方法

评审覆盖本 Change 相对 `446c198` 的需求、技术方案、实现与验证，包含子 skill 的临时仓库行为验证。独立 reviewer 使用隔离会话，不持有实现过程结论，只读工程，在临时本地仓库执行验证，不操作真实远端或服务。独立报告另附于下文；这里先登记整体验证中发现的问题。

## R1：无原型旧归档错误要求保留标签

证据：生产构建调用 `spec-change-workbench` 的预览描述接口，未关联原型却返回缺少 `spec-trail/archive/spec-change-workbench`。服务在读取是否存在关联前，对所有归档要求标签，影响旧 Change 的空态解释。

修正 T3 的归档入口判定：无关联或空数组保持正常空态；指定历史提交同样不要求多余标签。新增临时中心仓库回归，覆盖字段缺失、空数组及固定版本读取。`tests/previews.test.ts` 5 项通过，同时补充两个 Change 复用一个入口的验收验证。

## R2：annotated tag 发布后的核实误报失败

证据：归档工具能解析已有 annotated tag 的目标，但发布后仅比较 tag object id 与 commit id，实际分支/标签已推送仍报未完成。临时远端回归在修正前复现 `Remote branch/tag verification failed`。

修正 T2 的远端核实：读取 peeled commit 并比较最终目标，保持同提交重试与异提交拒绝的规则，不覆盖已有标签。`tests/prototype-tools.test.ts` 5 项通过，包含新 annotated tag 和重试场景。
