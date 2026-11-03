# 执行证据

## T1 交付持久短链接和受权限保护的空间返回入口

网页分享沿用现有空间名链接到对应仓库的 Changes 空间，目标只含稳定仓库定位，不包含分享者身份或连接。分享弹层按已接入可读来源准备 `/s/<id>` 与 `/s/<id>/agent`；目标映射通过完整文件原子发布，重复和并发生成复用记录，保存在数据目录的 `share-links/`，不设置过期时间。阅读导航保留短路径，Agent 分篇仍校验相同目标和快照；旧长链接和离线 CLI 保持兼容。

验证结果：

- `npm run typecheck`、修改文件的 Prettier 检查和 `git diff --check` 通过。
- `node --conditions=react-server --test tests/shares.test.ts tests/share-cli.test.ts tests/change-reading.test.ts`：30 项通过，覆盖并发复用、重新创建存储实例、非法标识、Agent 分篇及 HEAD、参数越界、匿名进入私有 API 被拒绝、解绑后的正文拒绝与映射保留，以及旧入口。
- `npm run test:e2e -- tests/browser/change-sharing.spec.ts tests/browser/change-reader.spec.ts --grep-invert 'adjacent Changes'`：10 项通过，覆盖网页/Agent 复制、剪贴板失败、材料与章节、桌面/平板/手机和深浅主题、来源变化与权限丢失、匿名点击空间名到登录页、本人有权限进入空间、有效登录但仓库被明确拒绝时不能进入私有目录。测试框架使用隔离账号上下文，和常驻浏览器登录分离。
- `npm run build`：生产构建通过，包括两条短链路由。
- 生产冒烟短暂停止主工作区服务，在本 worktree 的生产构建上复用真实持久数据及配置，以 `withSmokeSession` 管理专用账号。通过常驻 Chrome CDP 连接创建隔离冒烟上下文，验证真实分享、现有空间名跳转、手机无横向溢出；包装器退出并复查匿名且无可见绑定成功。重启生产测试实例后，同一 Agent 短链 GET/HEAD 仍返回 200。结束后停止测试实例并恢复主工作区原常驻服务；共享 Chrome 仍正常运行。临时冒烟脚本和日志位于 `/tmp`，未纳入正式源码。
- Agent 自查全部差异：映射仅作定位，不作为授权；匿名正文仍经过 `readSharedTarget` 和交付前复查，私有空间仍用访问者自己的账号与连接，短链参数不能替换目标；无未解决的本次实现问题。

验证边界：既有 `adjacent Changes follow the filtered directory order and return to the current row` 看板导航测试在本分支超时，也在未修改的 develop 上定向复现相同失败，未计入通过，本次未改动该功能。最初以撤销整个 Token 验证拒绝时，也观察到既有工作台恢复过程可能重复载入；最终按本需求使用“账号和 Token 仍有效，但仓库读取明确返回 403”的场景验证正常权限拦截，没有将整个 Token 失效的界面恢复计为通过。

正式常驻服务仍运行原已集成构建；本 PR 合入 develop 后需执行主工作区 `service:update` 并完成部署冒烟。
