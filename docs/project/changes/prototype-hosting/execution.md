# 执行证据

## T1

workflow 增加可选服务地址及三种托管选择，setup 原子保存并保留已有选择；新 hosted 包构建到 dist，原 Git 包和现有构建不被改写。移除设置字段、来源白名单和不同源要求，旧 prototypeOrigins 读取时忽略、保存时清除。

35 项配置、原型契约、setup、发布及预览测试通过；设置页面 6 项浏览器测试通过。类型检查、diff 检查及两个 skill 的 quick_validate.py 通过。浏览器测试使用本 worktree 的 .next-e2e，运行中的原工作区生产预览未改动。

依赖已集成：配置与访问 Change 在用户验收后归档于 f979022，合入当前分支；原型 UI 规则交付为已归档的 8a14dc8。

## T2

管理员接口生成并持久保存上传密钥，持有上传地址即可流式提交完整产物；按请求身份原子发布到本地目录，公开 GET/HEAD 支持静态类型、CORS、固定缓存和响应沙箱。共享发布身份校验从宿主 Git 工具中抽出，服务不运行仓库命令。

上传与既有发布 9 项测试通过，覆盖并发重复、错误地址、半截/超量/路径冲突、内容损坏、符号链接、取消、地址撤销及磁盘失败。新增独立 Node 进程读取验证重启后的落盘持久性，相关 3 项服务测试复验通过。真实 Next.js 浏览器验证匿名访问、同源和跨源 iframe、模块/动态 import、样式和图片及父 DOM/凭据隔离通过；本地跨来源测试显式授予 Chromium loopback 网络访问权限。类型和 diff 检查通过。

## T3

setup 可用本地管理密码自动获取并保存上传地址，publish upload 按 workflow 完成流式上传、结果保存及当前/Change 引用登记。上传地址不进入结果和成功日志。HTTP 失败、重定向保留原引用，上传后本地构建变化导致登记失败时，保存的 request/result 可用于恢复登记。README 与 skill 补充内置服务操作、存储备份和上传地址轮换。

验证结果：

- `npm test`：87 项通过，包含请求失败、重定向、登记恢复及既有 Git/custom 发布回归。
- `npx playwright test --reporter=line`：51 项中 50 项首次通过；分享链接测试在登录响应完成前断言 API，trace 证实请求竞态。改为等待受保护文档出现，保留原 API 和邀请码轮换断言；`npx playwright test tests/browser/access.spec.ts --reporter=line` 4 项复验通过。新托管的匿名资源/沙箱和 CLI 全流程两项均通过。
- `npm run typecheck`、`npm run format:check`、两份 skill 的 `quick_validate.py` 及 `git diff --check` 通过；测试等待修正另经 Prettier 检查。
- `npm run build` 通过，无构建警告；外部存储读取显式排除构建期追踪。临时数据目录启动生产服务，默认配置、管理员获取地址、匿名上传/读取、HEAD、CORS 和沙箱响应头冒烟通过，临时进程与数据已清理。
- 上下文隔离的独立 reviewer 覆盖 fc16f64 之后全部功能差异和未提交客户端，另运行 38 项相关测试，未发现待修复问题。

单实例文件存储仍需持久卷和备份，不自动回收历史版本。上传限制为每次 2000 文件/100 MiB、同时两次、120 秒；部署代理需允许相应请求体与时间。
