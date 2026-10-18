# 执行记录

## 实施前验证

2026-10-18 在独立工作区 `/home/tiger/workspace/open-folio-worktrees/central-change-routing` 推进，分支 `change/central-change-routing`。已 fetch 并确认包含 origin/main `8137926`。方案独立评审和主 Agent 核对见 [Review](review.md)，用户已授权评审后直接实施，代码阶段不调用 iclaude。

- `npm ci --ignore-scripts`：安装成功，未改依赖声明或锁文件。
- `npm test`：173 项通过，0 失败。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：10 项通过，0 失败。
- SVG 语法、几何检查和 Chromium 实际渲染通过。
- 临时 Git 实验确认共用登记提交可避免重复 branch 修改引起的归档冲突；过滤后的 merge 提交回流会删除规划，连续单父发布保留规划，详见 Research。

实施前长期开发服务运行既有主工作区构建。保护分支 main 未修改、未创建 PR；默认分支入口配置的发布仍遵守用户主动要求的边界。

## T1 — 定义集中入口与引用契约

新增共享 routing 契约，校验协作/保护分支角色与 Git 分支名称，按集中 live/归档记录生成单跳来源；集中旧业务字段不参与目标路由，已集成完整归档直接阅读。Workflow v2 要求 collaborationBranch，ChangeState 保持 v1；既有状态收尾可识别旧 workflow，后台 schema 只接受新配置。

更新 SpecTrail 主规则、Setup、Prototype 子 skill 的 develop 规划/集成与保护分支发布边界。Setup 检查保持只读，报告已知协作引用和未验证的权限；hook 对本次暂存 JSON 仍做完整校验，仅跳过继承副本的本地原型产物关联检查。

验证：`node --test tests/routing.test.ts .agents/skills/spec-trail/setup/tests/setup.test.mjs` 16 项通过；`npx tsc --noEmit` 通过；主 skill、Setup、Prototype 的 quick_validate 均通过。覆盖分支名与真实 Git 语法、配置双角色冲突、旧配置待接入、重复入口、归档终态、只读 Setup、继承原型与部分提交。CLI 操作和后台收集接线分别在 T2/T4 完成，尚未部署本检查点。

## T2 — 实现集中规划与可恢复移交

语义命令按协作入口约束创建、写入与读取，继承记录不再作为其他 Change 的当前状态；普通 Change 在协作分支不能进入 execution。handoff 在独立 worktree 创建 branch 登记提交，先发布目标再快进集中入口，两端共用提交；已有登记幂等复用，登记提交失败可重试，规划变化或无关脏文件保留现场并拒绝覆盖。命令使用既有状态锁，没有日志、指针格式或额外镜像状态。

验证：既有状态命令 16 项回归通过；新增工作区测试 7 项均已通过（最后一项修正 fixture 验收来源后单独复跑通过），TypeScript 通过。临时 bare remote/worktree 覆盖限定路径登记、远端目标拒绝、集中推送拒绝、不同规划并发后重试、同项规划变化停止、提交 hook 失败重试、主工作区暂存现场保留、响应后重复调用、新克隆与远端删除。归档交付合回 develop 后仍保留其他规划，工作分支删除不影响归档定位。测试过程发现旧准备分支重试必须无条件同步最新协作提交，已修正并复验。

## T3 — 实现工作区定位与会话续接

locate 输出集中入口、目标记录、固定提交、跟踪引用新鲜度、工作区以及 ahead/behind/dirty/分叉信息；prepare 定向刷新并复用或重建 worktree，保留本地提交和未提交文件，不自动重置、rebase 或 prune。结构化输出附带续接提示并明确会话绑定未验证。新克隆、其他 worktree 和 detached 当前 checkout 均可定位。

验证：工作区套件完整 8 项通过，新增落后/分叉/失效登记与 dry-run 引用不变检查。实际工具元数据复核记录在 Research：可创建/附加 managed worktree，但当前没有可调用的新会话或迁移入口，且创建工具明确保留原 checkout；因此交付人工打开并核验的可用路径，未声称会话已经迁移。

## T4 — 实现后台定向收集与增量刷新

移除全部 heads 与归档标签通配扫描，改为默认分支配置 → 协作分支目录 → 登记目标分支；仅为已登记的归档原型查询精确保留标签。每个来源冻结在一个提交，目标目录只读取所属 ID 的正文。默认配置仅用于发现协作入口，项目配置、Specs、当前原型与关联能力读取协作分支。索引采用共享路由，不选取继承旧副本或无入口标签；目标缺失、身份不符、重复 live/archive 明确诊断。

快照 schema 升为 4，扫描与缓存身份一起升级；旧全量快照不能作为当前缓存，受控旧 Git 缓存配置仅移除已知通配 fetch 设置，其他陌生配置仍拒绝。网络权限隔离、大小限制、失败保留快照、原型不可变引用继续沿用。

验证：新定向来源与增量套件 7 项通过，包括 40 个无关分支、精确引用调用、读取中目标持续推进、旧配置待接入、远端删除/强推、入口一致性、重复/身份异常、标签改写、缓存与刷新限额。完整 npm test 188 项中 187 项通过，唯一失败为旧 fixture 仍将 Change 指向 main；修正显式入口后该项单独通过。TypeScript 通过。既有原型、缩略图、登录、权限、公开预览与持久化回归均通过，浏览器来源文案和交互在 T5 验证。

## T5 — 统一工作台与关联材料的权威来源

工作台展示协作预发布来源；Change 抽屉区分集中入口提交/路径与完整记录来源，可打开入口 JSON 核对。来源异常时保留入口与诊断，不显示集中旧状态为当前进度。当前原型及历史版本策略文案统一指向协作分支。

验证：工作台、Specs、Change、当前/固定原型及自动刷新浏览器套件 37 项通过；新增集中状态滞后与目标不可用浏览器用例 1 项通过。TypeScript 通过。隔离 Codex 评审发现并修复 R8–R11，详见 Review；定向/增量/原型 12 项、工作区 9 项及新增远端子项删除用例通过。独立评审另跑权限/缓存相关 34 项通过，未发现新增权限绕过。T6 继续接入验证、整体收尾与服务更新。

## T6 — 交付迁移接入与本仓库试运行

Setup 新增只读 preview-routing 命令，从指定基线、已登记 worktree 与显式分支生成固定提交的接入建议；不联网、枚举未知分支或写入现场。缺失目标、归属冲突、local/tracking 差异、未归档 completed、尚未集成的工作分支归档和基线上的普通执行项均要求先处理。保留原始 Change、取消记录、历史归档和固定原型元数据，不引入迁移状态格式。AGENTS 明确独立 checkout 与已集成 develop 的长期服务来源。

验证与复验：

- `npm test` 全量 196 项通过；随后 R12 的增量修正及新用例由 `node --test tests/migration-routing.test.ts` 五项通过。独立 Codex 复验迁移五项、Setup 十二项通过，无未解决问题。
- `npm run typecheck` 通过，包含项目和 UI 包；三项 skill quick_validate 通过，新增脚本与测试格式检查、git diff --check 通过；`npm run build` 使用本工作区 `.next` 构建成功。此目录未运行长期服务，不覆盖其构建产物。
- 本仓库隔离克隆基于真实 main `8137926bfc8864c11d7538eb4d1b67616cae3852` 与实现分支，remote 替换为临时本地 bare 仓库。旧配置 Setup 返回待接入；准备 develop、新配置与校验器后返回 ready，实际 hook 拒绝协作/保护分支同名。实际本地推送验证协作创建路径；平台规则未被此实验冒充验证。
- 隔离演练完成 alpha/beta 两项规划、分别移交与幂等重试、定向恢复、alpha 执行/归档/快进集成、beta 返工、移除 alpha worktree 后读集中归档。主工作区始终 develop，保护分支未动，其他规划保留。单分支 clone 初次脚本误把普通 fetch 当成跟踪引用更新；改用 prepare 和显式 refspec 后全流程通过，CLI 的 cached-tracking-ref 标记符合实际。
- 同一隔离仓库连续两次以保护分支为单一父提交发布过滤后的交付树，两次均不含 changes，develop 规划仍保留；保护分支独立 hotfix 先按单项修复同步，再发布，最终内容保留。旧分支 live/archive 冲突的对照实验见 Research，实际 handoff 的共享登记基线归档无冲突。
- 真实仓库迁移只读预览给出已知历史保留和当前 Change 工作分支登记，errors 为空。真实 main、worktree 现场和远端引用未变；没有创建真实 develop 或 PR。临时演练仓库已删除。
- 在独立端口 55307、临时运行数据目录启动生产候选：首页与匿名 session 200，使用 Git 忽略配置中的验证 Token 登录 201；检查真实仓库返回 attention / “请完成 SpecTrail Setup，发布有效的协作分支配置”，与 main 尚为旧配置相符。Chromium 首页渲染且无 pageerror。候选实例及临时凭据数据验证后清理，现有用户数据未改动。

## 验收对应与待交付边界

A1–A5：共享路由/状态命令/工作区故障测试与两项隔离演练；客户端无可调用的新会话迁移入口，交付人工打开和身份核验，不声称完成宿主绑定。A6–A7、A10：定向来源、增量竞态、来源错误、缓存及权限回归与浏览器来源用例。A8–A9：归档/依赖/父子/取消测试、迁移五项与本仓库隔离接入。A11：main 未变、无 PR，以及连续发布保护规划/hotfix 实验。A12：38 项相关浏览器测试、当前及固定原型回归。

按 large 关闭规则提供上述可审阅实现后等待实际验收；不把实施前授权记录成已验收。验收后同步当前 Specs、归档并默认合入 develop，准备真实协作配置与主工作区，再从干净专用 checkout 更新长期服务。当前长期服务仍为旧提交 `e799050`，main 未发布协作入口；真实入口配置与兼容校验器发布到 main 须用户主动要求，不由本次 develop 集成代替。
