# 执行证据

## T1

实现账号、账号绑定与设备会话的新格式；异步 scrypt、有界派生入口、随机账号 Cookie、账号归属的加密 Token 和读取 lease 已接入。注册与密码登录不调用 Git 平台；无 Token 的账号可登录及管理设备。旧状态解析、旧 Token 登录和浏览器身份集合接口已移除，没有兼容或迁移路径。

单元／接口验证：`node --conditions=react-server --test tests/personal-sessions.test.ts tests/credential-api.test.ts tests/workspace-preferences.test.ts tests/discovery.test.ts tests/repositories.test.ts`，34 项通过；覆盖注册唯一性、错密、限流、Cookie、私密摘要、加密、重启恢复、权限及仓库读取。完整 `npm test` 首轮 229 项通过。

浏览器 `personal.spec.ts` 5 项通过：自填注册 → 首次绑定 → 仓库阅读、刷新恢复、失效 Token、错误密码及退出后绑定恢复，以及 834／390／320px。绑定列表和设备的基础界面与状态事务同此次替换接入；跨浏览器并发验证继续由 T2 完成。

## T2

绑定列表按账号共享，命名、去重、选择及全设备解绑已接通；账号设备可单台或全部退出，绑定保留。每台设备的选择和读取代次独立，绑定列表变化只更新列表版本；共享任务按账号工作台隔离。

`account-connections.test.ts` 与 `repositories.test.ts` 合计 25 项通过，包含两个账号绑定完全相同 Token 时的实际复制目标限制、偏好及私有快照隔离；在途绑定和切换遇到退出、解绑或代次变化均不能恢复授权。浏览器定向 13 项通过，覆盖账号跨浏览器恢复、独立选择、同浏览器标签页晚到响应、A → B → A、复制、设备及 R2 Unicode 修复。独立评审及修复见 [Review](review.md)。

另补两项浏览器用例通过：其他浏览器解绑后晚到正文无法返回；正在使用的 Token 被平台撤销时清除正文，但账号保持登录且可选其他绑定。临时平台故障保留上下文由既有 `automatic-refresh.spec.ts` 及新的受控会话测试覆盖。

## T3

已接通当前格式的离线密钥轮换、账号登录版 `withSmokeSession`、环境模板和 README。包装器在账号登录后按需绑定验证 Token，并跟进修改响应的 revision；结束时读取最新摘要、退出当前设备并复查匿名且无可见绑定。账号绑定保留，清理失败不可记为成功。真实值仅保存到忽略的本地环境配置。

隔离生产实例位于工作区 `.next`，端口 11118、tmux `openfolio-accounts-review`、数据目录 `/home/tiger/.local/share/open-folio-accounts-review`；未使用长期服务的数据或 Cookie。`service:update` 按停止、生产构建、启动顺序通过。类型检查发现新增测试的请求头联合类型不匹配，已明确类型后通过。

真实 GitHub 验证使用独立账号，经 `withSmokeSession` 绑定 Token 并读取 `iTgo-lyq/open-folio` 的协作分支工作台；第二个浏览器仅以账号密码登录后选择已有绑定，未再次提交 Token，读到相同快照。每个浏览器均在独立包装器回调内使用提供的 Cookie，回调内关闭浏览器；所有包装器均复查退出成功，匿名无可见绑定。首次手工检查地址与后台发现重叠返回 `DISCOVERY_RUNNING`；等待已有发现结束后通过。

重启恢复验证在包装器回调内完成：关闭 Chromium 进程、停止再启动隔离服务，检查相同账号设备、绑定、当前选择及 selectionRevision；再启动新 Chromium 进程，以包装器内存中的 Cookie 恢复界面。未导出 storageState、用户 Cookie 或明文凭据。桌面及手机截图位于忽略的 `artifacts/centralized-accounts/`。

独立评审指出的四项证据缺口已补齐并定向复核，无剩余已知缺陷。最终单测中的发现分类断言曾依赖并发探测的完成顺序；改为按仓库名比较完整分类集合，列表复验仍保留既有顺序测试，独立评审确认该调整合理。

正式交付需在人工验收后归档、集成 `develop`，再更新主工作区长期服务；停机时仅清理被替换的 `personal-v2` 及旧私有仓库／发现缓存，保留运维和公开原型，不导入旧数据。

最终验证：`npm test` 238 项全通过；`npm run test:e2e -- --reporter=line` 86 项全通过；`npm run typecheck` 和隔离实例生产构建通过。浏览器 A → B → A 的受控延迟用例另补全显式切换步骤后定向复验，避免仅依赖用例标题。协作分支已定向 fetch，仍为工作分支祖先，无待整合上游差异。

用户回复「合入吧」验收当前交付。归档前同步 develop 的 840c631（原型文件及文档），无服务代码冲突；重新运行 238 项单测、类型检查及 15 项账号浏览器检查均通过。Specs 同步个人访问、工作台及配置契约。

部署配置核对：长期服务实际使用 `.env` 配置的数据目录 `/home/tiger/.local/share/open-folio-public`；该路径与任务文档中的默认目录不同，已校正 AGENTS.md。停机后仅清理实际实例的旧个人模型及私有仓库／发现缓存，将外置凭据密钥路径改为其新 personal 目录；不清理另一个数据目录，不导入旧账号数据，运维配置与公开原型保留。
