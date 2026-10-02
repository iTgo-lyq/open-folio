# 原型管理调查依据

## 用户约束与项目决策

本次整理依据当前会话最后确定的方向：单项目单原型包，作为 monorepo 包使用；源码及静态产物由 Git 跟踪；关联和适配信息直接写入 Change；不要求截图；不提供模板服务；原型能力放在 SpecTrail 的 prototype 子目录，与 setup 子 skill 平级。

此前讨论过的忽略目录、独立上传服务、每页面完整工程、原型清单文件、独立顶层 skill 均不构成本方案要求。Impeccable 是可选开发工具，不作为协议基础。

独立 origin、归档保留标签、配置基线及具体字段规则是本 Change 提出的技术细化，不能据用户认可总体方向推断这些细节已经获得实施确认。

## 仓库调查：已确认

读取日期：2026-10-03。实现基线：`446c198`，包含已归档的工作台及小型 Change 流程优化；守护分支 `main` 当时为 `fcfa606`。新分支从最新 `origin/main` 创建，再快进纳入已交付基线，没有改写 main。

| 证据                                                                                    | 观察与影响                                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/skills/spec-trail/SKILL.md`、`setup/SKILL.md`                                  | 已有主/子 skill 组织方式；现行 WorkflowConfig/ChangeState 没有原型字段。需要同步契约，不能提前写入现行状态 JSON。                     |
| `src/server/schema.ts`、`src/server/indexer.ts`                                         | Change 和 workflow 使用严格 schema；增加可选字段也会被旧实现拒绝。原型局部解析错误需与核心流程错误区分。                              |
| `src/server/git.ts`                                                                     | bare Git 采集只读 `docs/project/`，仅 fetch 分支且使用 no-tags；现有白名单不提供 HTML/JS。扩展须明确 preview 根、资源类型和归档引用。 |
| `src/server/store.ts`                                                                   | 磁盘原子快照，保留当前及两个旧快照；无法直接承诺长期历史预览。历史资源应从仍可达的 Git 引用重建。                                     |
| `src/server/config.ts`、`src/app/api/[...segments]/route.ts`                            | 主 API 有 Host/Origin 检查，当前私有访问由部署网关承担；不能将 `Origin: null` 或预览域加入主 API 的允许列表来解决嵌入问题。           |
| `src/components/changes.tsx`                                                            | 详情已有概览、任务、文档、证据等区域；新增 Change 内标签即可，不需要单独 Hub。                                                        |
| 本地 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` | 当前安装 Next 文档支持 Route Handlers 自定义 Response；动态路由 params 为 Promise。实际实现仍应按安装版本指南核对 Host 分流及响应头。 |

## 一手协议资料：有条件可行

以下页面于 2026-10-03 读取。资料说明浏览器或 Git 的机制，不能代替本项目部署与端到端验证。

1. [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)：同源 iframe 同时允许脚本与保持 origin 存在逃逸父 sandbox 的风险。项目决策是在不同 origin 下运行产物，并同时施加响应头限制；iframe load 事件不能证明内容成功加载。
2. [MDN 同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)：协议、主机和端口共同决定 origin。项目据此可让两个主机名路由到同一服务，同时保留浏览器隔离；只改 URL 路径不产生隔离。
3. [MDN CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)：响应头 sandbox 可约束文档，去掉 allow-same-origin 会形成 opaque origin。项目决定为常见静态构建保留预览域自身 origin，不采用放宽主 API CORS 的方案。
4. [Vite 构建文档](https://vite.dev/guide/build.html)：多入口及相对基址可支持不同 HTML 入口共享构建资源。基础示例可用这种输出结构，用户工程不被绑定到 Vite。
5. [Git fetch](https://git-scm.com/docs/git-fetch)：分支和标签有不同的显式 refspec/自动跟随规则。项目需新增专用归档引用采集，不能假定当前 no-tags fetch 会保留已删除开发分支的原型版本。

## 尚未验证的实现边界

尚未实现新 schema、子 skill、原型包、资源端点或界面，也未运行新功能浏览器测试。现有 Node、Next、Playwright 环境可承接实现验证，但不据工具已安装就宣称通过。

双 Host 指向同一应用的路由分流、私有网关对预览 Host 的认证、浏览器嵌入下 cookie 行为以及 CSP 对真实构建产物的兼容，需要在后续实现的首个技术验证中覆盖。协议层可行；当前网关尚未为本功能配置，属于部署前置验证，不是用户需要选择另一套产品架构的问题。

归档标签规则、基线开关与缓存可重建方案是根据代码现状作出的设计推导；后续以真实临时远端仓库的推送、删除分支、删除标签和冷启动验证。测试失败应修订技术方案或实现，不能把历史版本静默替换为当前版本。
