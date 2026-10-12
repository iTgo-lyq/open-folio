# 当前页面外壳原型迁移至 R2

## 背景与目标

用户选择通过一个新 Change 将当前唯一的 workspace-shell 原型迁移到 Cloudflare R2；历史 Change 不改。用户已完成 R2 桶及凭据配置，并将配置同步至当前发布机器。沿用现有外壳源码与设计，不涉及界面调整。

## 范围与行为变化

- ADDED：项目原型包提供 R2 发布适配器，使用本机环境中的桶级读写凭据发布固定版本，验证公开访问内容后输出 SpecTrail 发布结果。
- MODIFIED：迁移成功后，workflow 的托管选择为 custom，当前清单与本 Change 记录同一 hosted 产物。构建输出改为忽略的 dist，源码继续入 Git。
- REMOVED：成功切换后删除当前包内 Git 预览产物；归档目录、旧 Change 引用和历史标签保持原样。

## 方案要点

small：复用既有 custom 发布协议与登记命令，仅增加项目级 R2 适配器及构建输出调整，预计不足 300 行有效实现，不修改工作台或共享契约。使用 Cloudflare 支持的 S3 SDK、Standard 存储类和 r2.dev 开发预览地址；不引入数据库或 Worker。凭据不入 Git。

版本由发布请求身份确定；写入使用条件创建，重复请求复用相同字节，冲突拒绝覆盖。全部产物上传并通过公开 GET 校验后才生成成功结果、登记引用。失败保留当前入口，允许原请求重试。被引用的 R2 对象需长期保留，不配置自动过期。

使用用户已配置的公开桶，在持有凭据的机器构建上传，验证后登记不含凭据的发布记录。R2 免费额度内使用，超额按官方计费；r2.dev 有开发流量限制。

## 验收标准

1. R2 入口返回与构建产物一致的 HTML，现有桌面、平板、移动视口及外壳交互正常。
2. 当前清单与本 Change 使用相同固定 hosted 引用，包含源码提交与内容摘要；工作台可预览。
3. 重复发布不覆盖旧字节；权限、内容冲突、公开读取失败均不产生成功引用。
4. 旧归档和标签未修改，历史 Git 预览仍可读取；凭据及 dist 未提交。

## 协作资源

2026-10-12 阅读 Cloudflare 官方资料：

- [R2 定价](https://developers.cloudflare.com/r2/pricing/)：Standard 有月度免费额度，超额计费。
- [公开桶](https://developers.cloudflare.com/r2/buckets/public-buckets/)：r2.dev 可作为开发预览地址，有速率限制。
- [凭据](https://developers.cloudflare.com/r2/api/tokens/)：S3 凭据可限定单桶 Object Read & Write。
- [JavaScript SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) 与 [S3 兼容性](https://developers.cloudflare.com/r2/api/s3/api/)：使用 region auto 与账户 endpoint，支持 PutObject 条件写入。
