# 执行记录

## 实施前验证

2026-10-18 在独立工作区 `/home/tiger/workspace/open-folio-worktrees/central-change-routing` 推进，分支 `change/central-change-routing`。已 fetch 并确认包含 origin/main `8137926`。方案独立评审和主 Agent 核对见 [Review](review.md)，用户已授权评审后直接实施，代码阶段不调用 iclaude。

- `npm ci --ignore-scripts`：安装成功，未改依赖声明或锁文件。
- `npm test`：173 项通过，0 失败。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：10 项通过，0 失败。
- SVG 语法、几何检查和 Chromium 实际渲染通过。
- 临时 Git 实验确认共用登记提交可避免重复 branch 修改引起的归档冲突；过滤后的 merge 提交回流会删除规划，连续单父发布保留规划，详见 Research。

当前长期开发服务仍运行既有主工作区构建，尚未更新。保护分支 main 未修改、未创建 PR；默认分支入口配置的发布仍遵守用户主动要求的边界。

## T1 — 定义集中入口与引用契约

新增共享 routing 契约，校验协作/保护分支角色与 Git 分支名称，按集中 live/归档记录生成单跳来源；集中旧业务字段不参与目标路由，已集成完整归档直接阅读。Workflow v2 要求 collaborationBranch，ChangeState 保持 v1；既有状态收尾可识别旧 workflow，后台 schema 只接受新配置。

更新 SpecTrail 主规则、Setup、Prototype 子 skill 的 develop 规划/集成与保护分支发布边界。Setup 检查保持只读，报告已知协作引用和未验证的权限；hook 对本次暂存 JSON 仍做完整校验，仅跳过继承副本的本地原型产物关联检查。

验证：`node --test tests/routing.test.ts .agents/skills/spec-trail/setup/tests/setup.test.mjs` 16 项通过；`npx tsc --noEmit` 通过；主 skill、Setup、Prototype 的 quick_validate 均通过。覆盖分支名与真实 Git 语法、配置双角色冲突、旧配置待接入、重复入口、归档终态、只读 Setup、继承原型与部分提交。CLI 操作和后台收集接线分别在 T2/T4 完成，尚未部署本检查点。

## T2 — 实现集中规划与可恢复移交

语义命令按协作入口约束创建、写入与读取，继承记录不再作为其他 Change 的当前状态；普通 Change 在协作分支不能进入 execution。handoff 在独立 worktree 创建 branch 登记提交，先发布目标再快进集中入口，两端共用提交；已有登记幂等复用，登记提交失败可重试，规划变化或无关脏文件保留现场并拒绝覆盖。命令使用既有状态锁，没有日志、指针格式或额外镜像状态。

验证：既有状态命令 16 项回归通过；新增工作区测试 7 项均已通过（最后一项修正 fixture 验收来源后单独复跑通过），TypeScript 通过。临时 bare remote/worktree 覆盖限定路径登记、远端目标拒绝、集中推送拒绝、不同规划并发后重试、同项规划变化停止、提交 hook 失败重试、主工作区暂存现场保留、响应后重复调用、新克隆与远端删除。归档交付合回 develop 后仍保留其他规划，工作分支删除不影响归档定位。测试过程发现旧准备分支重试必须无条件同步最新协作提交，已修正并复验。
