# 原型预览执行记录

## T1：统一原型关联与项目配置校验

新增无第三方依赖的共享契约供 hook、工具和服务使用。扩展可选字段，保留旧数据读取；非法原型关联单独诊断。提交校验检查暂存 HTML 的路径和 blob 模式，拒绝仅在工作区存在的文件、符号链接和删除仍被引用的入口；禁用后允许普通流程更新及删除旧关联。setup 安装器连同共享契约交付，并保留已有自定义脚本。

验证：`npm run typecheck`；`node --conditions=react-server --test tests/prototype-contract.test.ts tests/changes.test.ts`（11 项）；`node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`（5 项）。均通过。新功能端到端与 UI 尚在后续任务范围。

## T2：原型子 skill 与本地交付工具

交付 SpecTrail 内 prototype 子 skill、接入脚本、基础包和共享资源内联导出、静态/Chromium 检查、归档标签推送工具。主 skill 仅保留入口和归档交接。初始化保留已有内容，失败留 pending；拒绝决定持久化；同名异提交标签拒绝覆盖。

`node --conditions=react-server --test tests/prototype-tools.test.ts` 的 4 项场景通过：拒绝/重新同意/幂等接入与设计引用、失败恢复与 symlink 输出保护、运行时网络依赖被 CSP 验证捕获、远端归档标签发布/重试/冲突。修正首次复制到空目录时的 Node cp EEXIST 后复验通过。`quick_validate.py` 和 `npm run typecheck` 通过。浏览器工具仅验证初始加载，正式页面交互和设备适配仍需 T4/T5 验证。

## T3：固定 Git 读取与同域隔离

扩展专用归档引用采集，归档开发分支删除后仍可读取标签中的记录；保存已观察的标签目标以诊断后续改写。预览按完整提交读取项目配置、关联与 HTML，当前配置基线仍控制所有版本的功能开关。只暴露已关联入口，拒绝任意路径、无效 SHA、symlink、LFS 和超限内容；非法单项保留其他有效入口。preview 根只枚举元数据做总量检查，不下载未关联正文；该保守限额口径已同步 Technical。

新增主 API 入口描述和 GET/HEAD HTML 路由，复用同域认证；CSP sandbox 不含 allow-same-origin，禁用网络、父页面访问和持久存储，预览响应覆盖全局 X-Frame-Options: DENY 为 SAMEORIGIN。缓存格式升级为 2，旧缓存可重新读取重建。

`npm test` 的 24 项核心/工具测试通过；`npx playwright test tests/browser/previews-api.spec.ts` 的 3 项通过；`npm run typecheck` 通过。实测固定历史提交跨文档快照淘汰、删除归档开发分支后冷缓存重建、标签改写/删除拒绝、当前停用撤销历史预览、同域 iframe 交互与父 DOM/Cookie/存储/API 隔离、直接打开响应头沙箱、资源限额和项目配置移除。

## T4：Change 内原型浏览

新增原型标签、多入口、声明设备和旋转、自定义组件视口、画布适应与 100%、固定 Git 版本链接；保留现有抽屉和文档阅读。缩放只作用于展示，不改变 iframe 的布局尺寸。错误入口、失效版本、当前禁用、沙箱运行异常均给出可读提示。

`npx playwright test tests/browser/previews.spec.ts tests/browser/changes.spec.ts` 的 10 项测试通过；`npm run typecheck` 通过。测量实际 iframe 视口，覆盖 PC/iPad/移动端与 640px 局部组件、方向切换、深链接恢复、错误入口及移动端抽屉滚动。
