# Impeccable fork 与源码接入

## 背景与目标

用户明确要求：“那先操作我的 github fork 一下 Impeccable 吧。然后拉到当前项目中作为 submodule”。将上游源码引入当前 OpenFolio，为后续原型设计模块的接入研究与独立补丁维护准备可追溯的代码基线。本次为 small Change，交付是一项可独立验证的源码依赖登记。

## 范围与行为变化

- 在已认证 GitHub 账号 `iTgo-lyq` 下 fork `pbakaus/impeccable`，核对 fork 的父仓库。
- 当前项目通过 `vendor/impeccable` Git submodule 引用该 fork，固定具体提交；本地配置只读拉取用途的 `upstream` remote。
- 补充初始化、上游追踪及升级指针的开发说明，将第三方源码排除在 OpenFolio 自身 TypeScript 检查范围之外。
- 产品行为变化：无。本次不安装 Impeccable 依赖、不运行其脚本、不修改上游源码，也不接入 Live 或 Agent。

## 方案要点与依赖

保留已归档的 `spec-change-workbench` 交付，在 `codex/impeccable-submodule` 分支实施。该分支从已同步的守护分支建立，并纳入已归档、已推送的 `a3d708b` 交付；不合入守护分支。

子模块使用无凭据的 HTTPS fork 地址。提交由父仓库 gitlink 固定，不跟随分支自动更新；初始化后保持 detached HEAD，未来需要补丁时在子模块单独建分支、先推送 fork 提交，再更新父仓库指针。源码许可及声明原样保留。

## 验收标准

1. GitHub 返回 `iTgo-lyq/impeccable` 为 `pbakaus/impeccable` 的 fork。
2. 父仓库的 `.gitmodules` 和 mode `160000` gitlink 指向同一子模块，固定提交可从 fork 获取；子模块工作区干净。
3. 隔离的全新检出可以按说明初始化子模块，并得到同一提交。
4. OpenFolio 类型检查通过，第三方源码未被纳入自身检查；接入记录与实现提交到同名远端分支。

## 协作资源

- [Impeccable 上游](https://github.com/pbakaus/impeccable)，读取日期：2026-10-02。GitHub 元数据确认默认分支为 `main`、仓库公开且未归档；本次只接入源码，不将前期接入可行性预判当作已运行结果。
