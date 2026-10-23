# 技术与原型验证证据

2026-10-23，基于当前 develop 准备；本轮仅修改技术文档与原型包，未实施账号存储/API/真实 Changes 页面。

## 现状调查与方案核对

定向阅读账号存储、仓库上下文、作者解析、目录查询、阅读缓存与原型包。独立只读调查确认：Token 工作台偏好无法直接承载账号级视图；已有 repositoryKey 可作为稳定仓库键，账号锁与原子写入可复用；现有 browserRevision 只保护会话身份，管理整批写入仍需要仓库配置 revision。

技术稿核对后修正三点：仅 GitHub 数字 subjectId 可自动确认本人，旧 login 继续固定筛选；后台定义更新不覆盖显式 URL/history 的查询；取消数量动态归零与首次打开历史零结果链接分开处理。该核对属于方案准备，不替代正式实现的独立评审。

## 本地原型验证

- `npm run build --workspace prototype`：7 个自包含 HTML 入口成功构建。
- `node packages/prototype/verify-change-views.mjs`：9 组检查通过，零页面/控制台错误。覆盖浅深色 × 1440/834/390/320、管理/编辑布局、新增继承、多状态并集及作者交集、名称校验、编辑初值、取消/确认、拖拽/Alt 方向键/上下移、显隐与删除、失败重试、归档分类、取消零数量、详情返回、窄屏看板降级及切换右侧 tab 后选中项保持可见。
- `node packages/prototype/verify-quiet-workbench.mjs`：126 项通过，0 失败，0 浏览器错误（基础原型提交 783d203）。后续仅追加窄屏选中 tab 可见性修正，重新跑上述 9 组动态视图检查通过。既有 Changes 断言按本次默认我的、状态归档和新 tab 定位更新；滚动验证使用完整进行中列表，避免因默认我的仅 3 条不足以滚动而产生无效断言。
- `node .agents/skills/spec-trail/prototype/scripts/validate.mjs`：当前清单 7 个入口的元数据/静态校验通过。
- 人工查看桌面/手机首屏及管理、编辑截图，修复长弹层底部按钮超出视口，以及聚焦后排序辅助按钮引起编辑/删除点击目标位移。桌面和平板使用锚定弹层，手机保持两侧留白和可滚动表单。

验证产物位于 Git 忽略的 `artifacts/change-views/`、`artifacts/quiet-workbench/`；标准卡片截图由包内 screenshot 命令按桌面、iPad、手机生成。原型无真实业务请求与持久存储，验证在 `sandbox="allow-scripts"`、项目 CSP 和 Chromium OS 沙箱下执行。

原型交付范围为 `quiet-changes`，其余六组现有发布引用保留。固定版本、截图和真实工作台卡片加载结果以发布后的补充证据为准。

## 固定版本发布

源码提交 `5b19bdd072c0dbfda833843b19a56a01dbd1ec1b`；R2 版本 `96c1740f9e93916ab46b5115ec21de0efad71b5eaa1aeb224eb54f4444e2acd0`。

使用 `publish.mjs prepare`、项目 `publish-r2.mjs` 上传并进行公开字节校验，再以 `publish.mjs register --change change-focus-and-archive` 登记。result、项目当前清单和 Change 固定引用的版本及 sourceCommit 一致；三处 thumbnails 均覆盖 pc-web、ipad、mobile，各固定截图 URL 公开读取 HTTP 200。其他六个入口保留原有固定版本。

最终引用登记后，再次运行 `validate.mjs --browser`：7 个当前入口在 Chromium 沙箱中加载通过。使用专用测试账号及 `withSmokeSession` 刷新真实工作台仓库，确认原型清单指向最终固定版本；逐项切换 PC Web/iPad/手机，卡片 `img.complete=true` 且 naturalWidth 分别为 1440/834/390，src 均包含最终版本 ID。从真实卡片打开原型，核对默认我的、四个状态选项，完成添加及管理确认；浏览器无 pageerror。包装器完成退出并复查匿名、未连接、无可见绑定，账号原有绑定保留。

线上断言证据保存在 `artifacts/change-views/published-verification.json`（只含版本与检查结果，无凭据/Cookie）。常驻应用未重建或切换；服务通过仓库刷新读取新文档和原型清单。原型数据仍仅为内存示例，用户交互验收与正式实现验收尚未发生。
