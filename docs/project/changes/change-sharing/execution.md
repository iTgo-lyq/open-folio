# 实施与验证证据

## 工作区

使用 `/home/tiger/workspace/open-folio-worktrees/change-sharing`、`codex/change-sharing`。用户明确允许当前聊天通过显式指定工作区继续；已核对 cwd、分支及共享 Git 仓库身份。主工作区与长期服务保持 develop。

## T1 · 分享读取

新增持久分享记录及创建、查询、撤回接口；读取使用账号已有绑定的内部 lease，复用私有仓库权限 TTL、Git 缓存与合并刷新。公开 DTO 仅包含目标 Change；正文、图片、固定合入差异及 Git 原型 HTML/截图均检查分享、成员范围与当前快照，交付前再次复核。不会自动发布永久公开原型。

验证：`npx tsc --noEmit` 通过；`node --conditions=react-server --test tests/shares.test.ts tests/repository-permissions.test.ts tests/repositories.test.ts tests/personal-sessions.test.ts` 首轮 29 项通过；追加的刷新合并、在途版本变化及解绑检查后，`tests/shares.test.ts` 7 项全部通过（原有回归 25 项）。覆盖持久化与文件权限、幂等并发创建、账号隔离、非法版本/路径、GET/HEAD、撤回后缓存不可访问、设备退出、更新、解绑、固定权限复验、失权创建回收、损坏数据不覆盖，以及公开与私有读取共享刷新时单链接撤回不取消其他读者。

浏览器集成、完整 diff 阅读及真实服务检查随后续页面和整体交付验证执行；当前证据只证明服务端接口结果。

## T4 · 仓库与 Change 直接读取

将 T1/T2 的随机分享记录与创建/撤回接口替换为 `/share?repository=...&change=...&collaborationBranch=...`。匿名入口从已接入且当前可读的同仓库来源读取，不依赖分享者或设备；来源失效可切换，全部失效后停止交付。页面只保留复制和打开，导航、文档、图片、原型和代码差异持续携带目标与版本范围。

验证：类型检查通过；分享接口 10 项通过，账号/仓库/权限回归 25 项通过；分享及原工作台浏览器回归首轮 25 项通过。独立评审指出的图片错误、事件范围和损坏缓存隔离已修复并增加回归，详见 Review。图片用实际匿名来源刷新验证旧版本 409 后重读及来源丢失后清空正文。测试 fixture 重建分支时同步重置其测试远端，避免前一个用例残留造成非快进失败。

## T2 · 分享管理与阅读页

私有 Change 抽屉新增创建、复制、停止和重新分享；共用详情内容提取后，公开页使用独立阅读上下文，不加载个人 Provider。全宽材料/正文/章节布局沿用已验收原型，支持专注、大字号、相邻文档、章节进度、手机目录与相对路径深链。关联目标不在分享范围时显示“未分享”；原型使用受控资源并保留沙箱及运行错误报告。

验证：类型检查及独立工作区生产构建通过。`npx playwright test tests/browser/change-sharing.spec.ts tests/browser/changes.spec.ts tests/browser/previews.spec.ts tests/browser/integration.spec.ts tests/browser/follow-ups.spec.ts` 25 项全部通过；随后完善 Git 原型错误桥接后，分享 3 项再次通过。覆盖匿名无私有 API 请求、六类内容、固定代码差异、分享撤回和重建、退出设备后继续读取、文档路径跨分支移交和归档、窄屏与旧工作台回归。1440/834/390/320 截图已检查；1920 宽度下正文超过 1300 px，专注超过 1800 px，无全页横向溢出。截图位于工作区 `artifacts/change-sharing-*.png`（不提交）。
