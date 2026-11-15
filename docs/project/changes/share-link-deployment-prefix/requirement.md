# 分享链接保留部署前缀

`share link` 使用 `workflow.openfolioUrl` 生成概览、文档和原型分享链接。服务部署在子路径时，链接须保留该路径。这次修复延续「材料推送后直接提供分享链接」的本地生成行为。

在已校验的服务 URL 路径后附加 `/share`，兼容部署前缀末尾有无斜杠。沿用 URL 校验、材料定位参数和离线生成方式。

## 验收

- `https://folio.example.org/tools/folio` 和 `https://folio.example.org/tools/folio/` 均生成路径 `/tools/folio/share`，保留概览、文档和原型的定位参数。
- 根地址仍生成 `/share`，带凭据、查询参数或片段的地址仍被拒绝。
- 通过分享链接测试和 SpecTrail 相关测试。
