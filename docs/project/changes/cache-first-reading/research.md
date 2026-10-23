# 调查证据

基线为 develop 的 `0c87e91a8e05cedd5f63c29f4dca21de8066136d`，长期服务报告同一提交且工作区干净。

## 已有缓存

- SnapshotStore 的 workbench 读取本地快照；私有页面先请求 workbench，仅 NO_SNAPSHOT/CACHE_INVALID 时首次采集。自动刷新一分钟内复用成功检查；Git 分支与 blob 已做增量复用。
- Repositories 按绑定与仓库目录共享在途刷新，设备退出不重复启动相同任务。
- RepositoryPermissions 按绑定与仓库缓存远端权限五分钟，并发请求合并。既定 Spec 要求首次、到期及服务重启后先复验再交付内容。
- RepositoryRefresher 对活跃仓库约每分钟、空闲仓库约每五分钟更新，最多两并发。

## 已确认缺口

- `src/server/share-api.ts` 的分享详情无条件 await ctx.refresh；一分钟刷新复用窗口之外，即使有快照仍等待 Git/交付信息采集。
- `src/components/context.tsx` 的工作台读取和自动刷新 effect 依赖 q.m，阅读模块之间切换重复启动请求；只保留单个 loaded，返回其他已读仓库没有客户端复用。
- useDocument 在文档或快照变化时清空 value，没有正文缓存；快照更新而当前材料未变时也产生请求与空态。
- `src/components/personal-context.tsx` 在会话恢复的任意异常中清空 session/items、递增 epoch；目录刷新任意失败也清空 items。发现状态与列表初次请求串行。
- `src/components/prototypes.tsx` 依赖整个 data 对象，并在重新挂载时重新请求原型目录。
- PersonalSessions.authenticate 每次登录创建 workspaceId=null 的设备会话；PersonalHome 在没有选中 Token 时始终优先展示绑定新 Token，即使 connections 非空。
- discovery.list 一页最多二十个缓存仓库需等待全部权限复验；冷权限缓存涉及远端读取。此处不能通过放宽既定权限规则来省略复验，本次保留该契约。

## 运行验证

在长期服务上用 Git 忽略环境配置中的专用账号，通过 withSmokeSession 完成 API 与独立 Playwright 浏览器测量，两个调用均成功退出并复查匿名、无可见绑定；未使用用户 Cookie、未删除绑定或数据。

- 不重新绑定 Token 的新登录返回 authenticated=true、connected=false、connections 数量为 1。
- 手动选中已有绑定后，热缓存目录两次约 6 ms / 5 ms，workbench 两次约 23 ms / 21 ms；样本为两个仓库、一个含 312 个文档的工作台。这是本机热缓存 API 取样，不代表公网端到端首屏时间。
- 新浏览器确实显示「绑定一个 GitHub Token」及次要入口「选择已有 Token」。
- 阅读模块切换的短观察窗口内新增一个 GET workbench 和两个 POST refresh。
- 拦截 /api/session 制造网络失败后触发 focus，已有阅读页被「工作台暂时无法打开」替代。

以上为基线证据，尚不是优化效果。实现后用确定性的请求挂起、失败与身份切换测试验证缓存先展示，再以相同真实服务方法补充结果。
