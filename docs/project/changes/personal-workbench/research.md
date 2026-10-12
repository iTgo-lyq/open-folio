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

本轮用户已明确选择“原型全部可以公开访问，不需要做另外权限校验”。需求据此将 Git 来源原型和截图也纳入公开交付，工程文档仍受个人仓库权限保护。技术设计需区分“用用户 token 读取仓库取得产物”和“匿名读取已准备好的公开产物”，不能给匿名请求借用他人凭据。

## GitHub 凭据与发现实验

此前会话使用用户临时提供的 fine-grained PAT，在排除本地凭据的条件下读取当前账号与指定私有仓库元数据；匿名 `ls-remote` 失败，指定账号与 PAT 后成功。令牌不写入仓库、输出、命令参数或持久化文件。

本轮以相同 PAT 直接调用 GitHub 仓库列表和指定仓库工作流文件接口，仅注入该 token，不读取本地 CLI 登录态。结果将在技术方案中列明；引用读取不等同于正式产品的完整采集与权限回归。

## 官方平台契约

[List repositories for the authenticated user](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user) 提供 `GET /user/repos`，覆盖本人拥有、协作以及组织成员关系带来的仓库；支持分页与 affiliation 条件。fine-grained PAT 使用 Metadata 读取权限，内容读取另需相应仓库 Contents 权限。

[Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) 提供 `GET /user`，返回稳定账号 id 和登录名，可验证 token 身份。不能通过公开仓库的匿名可读性推断 token 有效。

[个人访问令牌说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)说明 token 受仓库选择、资源所有者、有效期与组织策略限制。发现结果只代表当前 token 的授权范围。

[Repository contents](https://docs.github.com/en/rest/repos/contents#get-repository-content) 可读取默认分支的工作流文件，避免发现阶段逐仓库全量拉取。缺失文件与仓库权限不足都可能涉及 404，需结合身份和仓库权限证据分类。

## 平台扩展边界

公开仓库只交付 GitHub.com。其他平台的具体接口、scope、主机及数据结构不进入此仓库；只定义平台无关的身份、仓库发现、权限、文件探测和 Git 鉴权适配接口。使用虚构平台的测试适配器证明核心读取与会话不依赖 GitHub 数据形状。

技术方案需要覆盖：token 服务端加密保管和会话撤销；身份、仓库权限与缓存隔离；分页、增量发现和失败恢复；安全的 Git 进程环境；公开原型的受控准备和匿名交付；旧配置、深链接和管理入口迁移；现有原型包的完整交互验证。
