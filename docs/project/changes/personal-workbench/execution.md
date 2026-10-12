# 实施证据

## T1 建立可扩展的 GitHub 仓库适配契约

新增服务端 Provider 契约、不可 JSON 序列化且调试输出脱敏的 SecretHandle、稳定仓库键与显式注册表。公开版本仅注册 GitHub；实现身份、分页、稳定 id 重新定位、Contents 读取检查、固定提交树遍历和 HTTPS 传输描述。HTTP 请求只向 GitHub API 主机发送指定 token，禁用重定向与缓存，设置超时、响应上限和统一错误。

工作流探测逐级检查普通目录／文件，树证实缺失才返回 missing；符号链接、子模块与非法位置返回 WORKFLOW_INVALID，留给发现层归类。API 版本采用本轮核对的官方 REST 示例版本 `2026-03-10`；[仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)与[Git Trees](https://docs.github.com/en/rest/git/trees#get-a-tree)作为映射依据。

验证：`node --conditions=react-server --test tests/providers.test.ts`，8 项通过；`npm run typecheck` 通过。测试覆盖前向分页与恶意 continuation、稳定身份改名、缺失与权限失败区分、普通文件／符号链接／子模块、树截断、空仓库、身份过期、限流、秘密不可序列化及虚构第二适配器。真实 GitHub fetch 和发现服务集成随 T2／T4／T5 验证，此处不报告完整联调。
