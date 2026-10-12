# 个人工作台调查依据

调查日期：2026-10-12。正文仅记录可复用证据与尚未验证的能力，不保存 token、邮箱或私有仓库内容。

## 当前实现

基线为 `main` 的 `b13bb0c057758821e55a82fd4a9e91d47ad7a3b8`，本轮已 fetch 并确认与 `origin/main` 一致。当前本地分支与 worktree 均没有 `docs/project/changes/` 中的未完成 Change，本次建立独立需求。

| 事实 | 依据与影响 |
| --- | --- |
| 项目来自全局配置，保存不校验仓库可达与工作流接入 | `src/server/config.ts` 的 `saveConfig`；`src/app/api/config/route.ts`。连接和发现将替代先登记项目的流程。 |
| Git 读取可能使用服务机器凭据 | `src/server/git.ts` 的子进程继承环境；虽然禁用了交互，但未隔离系统／全局凭据 helper 等来源。禁止弹框不能等同于显式 token 鉴权。 |
| 管理密码或项目邀请码决定访问 | `src/server/access.ts` 的 `accessFor`、`requireProject`；管理员可读所有项目。新授权必须覆盖所有读取入口。 |
| 快照与文档缓存按项目复用 | `src/server/store.ts`；缓存正文读取不会重新验证远端仓库权限。现有缓存不能直接沿用为授权结果。 |
| 当前工作流识别来自默认分支 | `src/server/indexer.ts`、`src/server/schema.ts` 的 `workflowCoreSchema`；缺失／非法配置生成诊断，而不阻止配置保存。发现需明确区分未接入、配置异常与检查失败。 |
| 前端围绕全局项目和邀请码组织 | `src/components/context.tsx`、`workspace.tsx`、`settings.tsx`。涉及首次进入、分享解析、项目选择、配置和错误状态的联动替换。 |
| 部分原型资源有独立的公开访问边界 | [项目访问](../../specs/project-knowledge/access/spec.md)、[原型浏览](../../specs/project-knowledge/prototype-preview/spec.md)。Git 读取权限变化不会自动封闭内置或外部已发布 URL。 |

本仓库 `workflow.json.prototype` 已启用，使用 `packages/prototype`，托管选择为 custom。当前清单只有工作台外壳。根据 [原型协作规则](../../../../.agents/skills/spec-trail/prototype/SKILL.md)，本次大范围 UI 改造必须在正式实现前补齐原型。

## 既有 token 实验：已验证的有限结论

此前会话中的实验使用用户临时提供的凭据，排除本地凭据 helper、配置、登录态和默认凭据文件的影响；令牌不写入仓库、输出、命令参数或持久化文件。

- Codebase：使用个人 PAT 与用户提供的 Git 用户名，针对指定仓库执行 `git ls-remote --symref … HEAD` 成功，取得默认分支与 HEAD。更早的另一类 token 未成功，不能把所有 token 类型视为可互换。
- GitHub：使用 fine-grained PAT 读取当前账号与目标仓库元数据成功；目标为私有仓库。匿名 `ls-remote` 失败，指定账号与 PAT 后成功。
- GitLab：尚未提供真实测试仓库与 token；未执行集成实验。

上述结果证明两个指定仓库的引用读取可用。未执行完整 `fetch`／采集，没有验证当前用户的仓库枚举、Codebase 个人身份 API、撤权与恢复行为，也没有修改正式产品代码。

## 官方平台契约

### GitHub

[List repositories for the authenticated user](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user) 提供 `GET /user/repos`，覆盖本人拥有、协作以及组织成员关系带来的仓库；支持分页与 affiliation 条件。该列表接口的 fine-grained PAT 权限为 Metadata 读取，完整内容读取另需相应仓库 Contents 权限。

[个人访问令牌说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)说明 token 可受仓库选择、资源所有者、有效期与组织策略限制。因此发现结果只能代表当前 token 的授权范围，不能声称列出了用户在平台上的所有仓库。

### GitLab

[Projects API](https://docs.gitlab.com/api/projects/#list-projects) 提供项目列表与 `membership` 条件，可据此限定当前用户参与的项目；需要处理分页和实例地址。

[Access token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/) 区分 `read_api` 与 `read_repository`：前者用于 API 只读权限，后者支持 Git-over-HTTP 和仓库文件 API。连接设计需要分别验证个人身份／仓库发现与 Git 内容读取，不能仅根据 Git 拉取成功断言 API scope 已满足。

### Codebase

本地一手工具说明 `/home/tiger/.agents/skills/bytedcli/references/subskills/bytedance-codebase/GUIDE.md` 及 `references/codebase.md` 提供 `codebase repo list`、文件读取和成员能力，生产网数据 API 指向 `https://code.byted.org/api/v2/`。这支持“需要独立平台适配”的判断，不能据此认定 GitLab v4 接口兼容。

工具默认认证链可能使用 JWT、应用凭据、PAT、SSO／ZTI 换票，并在某些失败后回退。验证用户 token 时不能直接运行默认认证命令，以免把宿主已有身份的结果误当成所给 token 的能力。

需在技术阶段核实：个人 PAT 的身份识别与列表请求格式；枚举是否限定本人参与、能否包含继承权限；分页与限流；列举及文件读取所需 scope。现有 `ls-remote` 实验不覆盖这些问题。

## 技术阶段需要解决的内容

- 明确各平台连接、实例、个人身份、仓库稳定标识和深链接的契约，以及一个用户多个连接时的选择规则。
- 证明 Git 与 API 都只使用指定 token；保留必要代理和 CA 信任，同时隔离宿主凭据，限定凭据可发送的目标并处理自建实例。
- 明确服务器保管 token、浏览器会话、连接恢复、退出、轮换、失效和跨用户隔离；不把本地凭据当作运行依赖。
- 明确仓库发现与识别的分页、增量展示、限流、重试和诊断；给出每个平台的真实集成验证路径，不能只依赖模拟数据。
- 明确每次新内容请求的权限确认、在途请求撤销、共享采集和缓存边界，避免权限校验成功与数据交付之间串用连接。
- 根据需求确认结果处理内置静态托管的权限边界；外部宿主权限不能由工作台凭空代管。
- 说明旧项目 id／分享链接、配置、管理接口与缓存的迁移及回退；保留运维设置的受控入口。
- 基于现有组件库与原型包交付完整个人工作台流程预览，再形成正式实现方案与计划。
