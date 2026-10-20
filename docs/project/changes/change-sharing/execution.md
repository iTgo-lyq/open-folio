# 实施与验证证据

## 工作区

使用 `/home/tiger/workspace/open-folio-worktrees/change-sharing`、`codex/change-sharing`。用户明确允许当前聊天通过显式指定工作区继续；已核对 cwd、分支及共享 Git 仓库身份。主工作区与长期服务保持 develop。

## T1 · 分享读取

新增持久分享记录及创建、查询、撤回接口；读取使用账号已有绑定的内部 lease，复用私有仓库权限 TTL、Git 缓存与合并刷新。公开 DTO 仅包含目标 Change；正文、图片、固定合入差异及 Git 原型 HTML/截图均检查分享、成员范围与当前快照，交付前再次复核。不会自动发布永久公开原型。

验证：`npx tsc --noEmit` 通过；`node --conditions=react-server --test tests/shares.test.ts tests/repository-permissions.test.ts tests/repositories.test.ts tests/personal-sessions.test.ts` 首轮 29 项通过；追加的刷新合并、在途版本变化及解绑检查后，`tests/shares.test.ts` 7 项全部通过（原有回归 25 项）。覆盖持久化与文件权限、幂等并发创建、账号隔离、非法版本/路径、GET/HEAD、撤回后缓存不可访问、设备退出、更新、解绑、固定权限复验、失权创建回收、损坏数据不覆盖，以及公开与私有读取共享刷新时单链接撤回不取消其他读者。

浏览器集成、完整 diff 阅读及真实服务检查随后续页面和整体交付验证执行；当前证据只证明服务端接口结果。
