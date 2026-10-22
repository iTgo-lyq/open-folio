# 执行与验证

## T1

只在集成分支有效归档的主来源读取 `deliveryOverride: "releaseMerged"`，其优先级高于自动交付推导。共享校验器与服务端契约同步增加单一可选值，非法值在读取时隔离并提示，写入时拒绝。索引指纹升级使已有缓存重新读取。主 skill 只增加字段定义和升级说明入口，独立升级说明共三条。

验证：

- delivery-override、delivery、pr-archive-check、incremental-cache 共 24 项通过；新增 CI 测试最初因夹具停留在 develop 触发归属检查，修正为工作分支后 10 项归档 CI 测试全部通过。
- Setup 测试 12 项通过；typecheck、format:check、skill quick_validate 和 git diff --check 通过。
- 真实 Git 夹具覆盖集成归档优先、源分支删除、工作/发布副本无效、移除覆盖恢复自动判定、PR 缺权/歧义、仓库读取失败仍抛错，以及覆盖不能绕过归档和发布 CI。

自评审：逐项核对需求、生产差异与测试，未发现阻塞问题；无 UI 改动，不增加界面验收。未批量修改实际历史归档，未改变 PR/Git 证据或 CI 条件。
