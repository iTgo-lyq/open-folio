# 技术方案

从公共 `checkRequest` 删除基于允许来源生成主机名集合的逻辑，以及从 `Host` 或请求 URL 回退提取主机名的判定。所有 API 与 Git 原型响应已复用该函数，无需增加路由级开关。

`allowedOrigins` 继续提供允许的 `Origin`，本机默认来源和 `sec-fetch-site: cross-site` 拒绝规则沿用。配置结构、服务监听、项目权限与原型沙箱不变，不引入用户管理或其他部署依赖。

更新已有单元和 API 集成测试：读取允许未登记的 Host 与 URL 主机名；合法 Origin 的刷新允许代理内部 Host；非法来源及缺失来源继续拒绝。运行单元测试、类型与格式检查、聚焦 API 浏览器测试和生产构建，并按 medium 要求独立评审。

README 随实现更新，验收后将长期请求约束同步到 `project-knowledge` Spec。
