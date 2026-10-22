# 执行与验证

## T1：后台常驻扫描与活跃间隔调整

Node 服务启动时创建单个调度器，从现有 Token 绑定和发现记录恢复全部已接入仓库。复用无浏览器凭据读取、权限复验、定向 Git 增量扫描和同来源刷新合并。全局并发上限为两个，同一轮不重叠；活动按工作台、仓库和集成分支隔离，私有页面与匿名分享页刷新均登记活动。两分钟无刷新请求后，后台改为每次完成后至少五分钟再次执行；有近期页面活动时使用一分钟。

验收证据：

- `npm test`：全量 295 项通过；随后补充页面活动登记与解绑测试，`node --conditions=react-server --test tests/background-refresh.test.ts` 的全部 6 项通过。
- `npm run typecheck` 与补充测试后的 `npx tsc --noEmit` 通过。
- `OPENFOLIO_DATA_DIR=/tmp/openfolio-background-build-check npm run build` 通过；该隔离路径未被创建，Next.js 的构建阶段使用 `NEXT_PHASE=phase-production-build`，启动入口显式排除此阶段。
- `npm run test:e2e -- tests/browser/automatic-refresh.spec.ts tests/browser/change-sharing.spec.ts`：8 项通过，覆盖页面自动刷新、隐藏暂停、临时错误、失权、匿名分享及版本切换。
- 独立生产实例使用临时数据目录与 11357 端口：在首次 HTTP 请求前即观察到后台扫描对隔离损坏状态的诊断，确认启动扫描不依赖页面；原测试文件保持原字节。清除该临时故障后首页与匿名会话接口均返回 200。验证实例已退出，临时数据已清理。
- 真实受控 Git 夹具在设备退出后、不打开任何页面的情况下，首次后台扫描创建快照；推进五分钟后采集新推送 Spec 与 Change。失权检查保留旧指针，重建调度器后恢复目标，解绑后不再扫描。

自查覆盖全部新增实现、活动入口与验收对应，未发现未解决问题。后台只更新服务快照，不写中心仓库文档。没有修改或重启正在运行的前端测试分支，也未部署主服务。
