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

独立 reviewer 追加复核分享链接的等待修正，确认仍要求受保护正文实际出现，保留登录后 200、换码后 401 和旧链接失效断言；两处构建追踪注释不改变文件校验。

持久预览已切换到本 worktree 的生产构建，沿用现有数据目录、tmux 会话和 Merlin 端口转发。10680 的 IPv4/IPv6 首页均为 200，匿名上传地址发现接口为 401；原 worktree 构建保留供回退。Merlin 现有平台访问控制保持原设置。

单实例文件存储仍需持久卷和备份，不自动回收历史版本。上传限制为每次 2000 文件/100 MiB、同时两次、120 秒；部署代理需允许相应请求体与时间。

## T4

根据当前 UI token、业务样式、壳层组件及桌面/手机截图重写原型包 DESIGN.md，补充依据、色彩角色、字阶、布局/断点、组件交互和实际范围。参考来源登记在 Requirement。skill 提供中立 DESIGN.template.md 与简短指南；setup 默认采用模板，--design 仍链接已有规范，并保留用户已编辑的 DESIGN.md。已选择 Git 时不补问无关服务地址。

当前工程移除三个测试 demo，只保留 workspace-shell，品牌素材改用现有产品图标。workflow 明确 provider:git，外壳构建为自包含 HTML；源码、当前清单和 Git 固定快照构成此次交付，未调用原型上传服务，历史归档未修改。

`npm run build --workspace prototype`、`validate.mjs --browser`、8 项 prototype-tools 测试、格式和 skill 结构检查、diff 检查通过。临时 Playwright 检查 1440×1000、768×1024、390×844、320×740：导航与选中、折叠、搜索过滤、Ctrl+K/Escape、焦点返回、配置入口、减少动态效果和无横向溢出全部通过；无脚本错误及外部网络请求。截图位于忽略目录 artifacts/workspace-shell-*.png，已和现有产品外壳对照。正式应用和 UI 包未改动，沿用 T3 生产构建与整体验证证据。

独立 reviewer 复核 T4 全部差异与四张截图，验证默认模板完整复制、Git 无需服务地址、既有 DESIGN.md 不覆盖，另运行两项 setup 回归通过；未发现待修复问题。源码提交 95175df 后，通过 publish register 登记当前清单和本 Change 的 Git 固定快照，二者字节一致；登记后沙箱复验通过。
