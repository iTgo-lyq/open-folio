# 子模块原型的读取、发布与固定追溯

## 前端先发布，主仓库最后关联

前端提交干净源码 A，以 A 构建固定产物，登记清单后提交 B；主仓库最后一次提交 P，同时更新 gitlink B 和 Change 引用。追溯链为 P → B → A / 固定产物。前端不需要 SpecTrail workflow，也不需要先把 A 提交到父仓库。

主仓库继续管理配置、Change、归档与权限边界。原型总览仍从指定父提交的 .gitmodules/gitlink 读取清单，嵌套路径和普通目录规则沿用 T1/T2。此次调整由用户直接指定，覆盖原方案要求父仓库预先提交构建基线及两库联合登记的做法。

## 来源契约及兼容

artifact 保留 sourceCommit，新增可选 source 对象：

```json
{
  "sourceCommit": "<前端源码提交 A>",
  "source": {
    "repository": "https://example.org/team/frontend.git",
    "packagePath": "packages/prototype"
  }
}
```

- source 缺失：旧语义，sourceCommit 属于主仓库，沿该父提交追溯；不改写历史记录。
- source 存在：sourceCommit 属于声明的原型仓库；packagePath 相对该仓库，根目录用空字符串。父仓库关联时补 submodulePath、catalogCommit=B 和 bindingCommit=关联前已有父 HEAD Q：Q 固定原仓库映射，B 固定已提交清单；Q 必须属于交付历史，A 必须是 B 的祖先。当前清单读取时从本次固定 P/B 合成这些字段，覆盖子清单自报的父信息。
- 校验必须先按固定 Q 的 .gitmodules/gitlink 定位允许的仓库，核对源仓库身份后读取 B，再检查 A 为清单所在提交 B 的祖先，并从 A 的原型包读取对应源码。不把 A 当父对象，不按 artifact 的任意地址直接发送凭据。关联也复查父当前清单及活动/归档 Change 的已知固定 URL，冲突不写入。
- 发布请求沿用 schemaVersion 1，新增可选 packagePath 选择独立包模式；repository/sourceCommit 在此模式为前端仓库/A。requestId 将显式 packagePath 纳入身份，旧请求缺省时算法和已有产物标识不变；成功结果格式不变。新来源信息由经验证请求写入 artifact。

这是新增可选来源范围，旧配置、请求、artifact 和归档继续可读，无强制迁移。新引用需要支持该字段的工具；不让旧 sourceCommit 静默改含义。

## 发布、清单与关联

### 前端发布

prepare 指定 --repo 前端仓库、--package 原型包（根目录用 .），directory 和清单路径相对前端仓库；无需 workflow。核对 HEAD A、干净源码/依赖及已提交入口后构建准备请求。custom 适配器继续消费 request/result；OpenFolio 上传地址和服务根地址由显式参数或宿主环境提供，不要求复制父 workflow 或凭据文件。

前端 register 只更新当前清单和 Git 兜底产物引用，禁止同时写 Change。源码入口与 A 一致，只豁免清单和声明的生成 HTML，源码及其他依赖不豁免。重复登记和 recover 复用现有单仓库事务；上传已成功时可重用保存结果。然后由使用者提交/推送 B，工具不代为提交。

普通单仓库工作流保留现有命令。主仓库配置指向子模块时，旧的跨库 prepare/register 给出改用前端发布和父关联的提示，停止生成新的跨库登记事务；已经遗留的日志仍可恢复。

### 主仓库关联

新增 associate --repo 主仓库 --change id [--entry id]。按主仓库配置、已登记/暂存 .gitmodules 与实际前端检出定位所属包，读取干净且已提交的 B；这一步允许父 HEAD 的 gitlink 仍指旧版本。校验固定来源身份、A/B 历史关系及入口，复制显示信息和固定引用到 Change，Git HTML 从 B 复制到主仓库 Change 快照。

关联只锁定和写入主仓库，子清单保持不变。子模块映射须已按正常接入步骤提交到 Q；发布不要求提前更新 gitlink 到 A/B。新单库事务仍记录所属仓库 HEAD，恢复遇后续提交停止。完成后将父 gitlink B、Change 和快照一起暂存、校验、提交 P。若前端继续变更，重新关联对应已提交版本；不存在跨库回滚或隐式提交。源码和产物发布失败不会创建关联，关联失败也不重新发布前端产物。

## 读取、权限与历史

当前清单从固定 P/gitlink B 读取；新 artifact 以明确来源读取源码 A，Change 从自身固定版本或归档合并 M 读取引用。源码追溯检查仓库绑定、A 在 B 历史中及 A 的入口文件；不要求 A 存在父仓库。旧引用保持既有父基线追溯。路径迁移后仍用固定历史父版本及来源中记录的包/挂载路径。

子仓库权限仍由当前连接独立检查，缓存/旧快照不能绕过拒绝；新公开版本发布前即时复验，已公开产物匿名读取不访问仓库。主仓库已有的 hosted 引用和 Git 快照可在子源码失效时继续读取，但 sourceAvailable=false 并明确原因。源仓库不匹配、A 不在 B 历史或对象不可用时不取最新分支兜底。

hook 对新/修改关联按父 index 读取 .gitmodules/gitlink B，要求实际清单版本等于 catalogCommit，校验新来源在正确仓库；不要求父 index 已经有新提交。previews-set、归档 preflight 同样支持新旧来源，仍不在 hook 内联网。Git 快照继续位于父 Change/归档目录；标准 archive CI 不注入私有子仓库凭据，也不把父结构通过当作子源码可用证明。

## 验证与交付

重点验证：前端无 workflow、父仓库零预提交；hosted/Git 与根目录/内部包均完成 A → 发布 → B → 父单次 P；父 HEAD 在发布期间保持不变；关联不改子清单；P/B 及以后子分支变化不改历史。覆盖来源身份冒用、A 非祖先、脏源码/清单、上传或关联失败重试、旧引用及旧请求标识兼容、子权限撤销、嵌套 gitlink 和语义归档。

T1–T3 的原任务定义及验证证据保留，追加 T4 替换发布顺序并完成契约、工具、服务和回归。沿用原验证与独立评审要求，skill 只更新现有三条说明。按分发约定同步补丁版本；无数据清理，无自动推送子仓库。完成后等待用户最终验收，再按实际授权归档、合入和更新常驻服务。

本方案减少跨库写入与恢复协调，只增加区分源仓库所必需的可选字段。共享来源解析、现有摘要和固定产物保留继续使用，不新增发布数据库或额外审批步骤。
