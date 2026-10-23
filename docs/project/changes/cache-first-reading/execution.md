# 执行证据

## T1 分享详情缓存先读与后台更新

详情默认先读快照，显式 refresh=1 等待更新；缓存缺失及旧快照找不到目标时刷新。普通详情允许交付构造时的完整授权快照，资源保持固定快照与响应前权限检查。客户端初次展示后继续更新，版本竞争安排后续重读。

验证：`node --conditions=react-server --test tests/shares.test.ts` 12/12 通过；`npm run test:e2e -- tests/browser/change-sharing.spec.ts` 7/7 通过；`npm run typecheck` 通过。覆盖刷新挂起时缓存返回、共享刷新合并、新 Change、临时失败保留、失权、分支移交/归档及图片版本竞争。现有测试中需要主动触发更新的调用已改用 refresh=1。
