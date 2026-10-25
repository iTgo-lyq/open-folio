# 执行证据

## T1：批量读取与复用 PR 页面

交付采集按集成、发布目标分支分别查询，使用本轮共享目录建立关联索引，删除逐 Change 的详情、head 与 commit 补查路径。PR 页面按 created 降序读取，来源目录下持久化完整分页、ETag、原始数量和标记摘要，不保存正文；完整查询成功后替换，失败保留对应旧集合。未变化快照发布缓存前也复查权限。

验证：`npm run typecheck` 通过；provider、delivery、delivery-override、pull-requests、store、repositories 共 44 项通过。随后新增真实 collectDelivery 的 138 Change 请求计数回归，与页面缓存测试共 11 项通过：冷、热两轮都仅两次 base 查询，同 base 合并为一次。

模拟 HTTP 证据：74 个重复读取仅发一次请求；两个 base 冷缓存共 2 次 200、热缓存共 2 次 304。1001 个 PR 完整读取 11 页，末页旧 PR 标题与标记修改后前 10 页 304、末页 200。无 Link 的满页 304 仍能读取新增尾页；未标记和跨仓库 PR 不进入索引。缓存损坏、缓存大小上限、第二页失败、其他 base 独立成功和无 ETag 路径均有回归。
