# 独立评审

## R1：无关工作分支的作者混入当前 Change

独立 reviewer 使用真实临时 Git 仓库复现：alpha 的正式来源为 develop，beta 的正式来源为 change/beta；beta 分支新增 alpha 材料且未合入时，初版按全部来源的 id 汇总会将 Beta Worker 计入 alpha，分享投影也受影响。优先级 P2。

修复交 T3：以每个 Change 的合法来源限制可达历史，保持按来源批量读取。复验结论在 T3 完成后补充。评审其余身份去重、邮箱投影、配置兼容及弹层链路未发现新增实质问题；最终构建和浏览器证据由主 Agent 提供。
