# T1

拦截脚本先安全读取 Service Worker，仅在浏览器允许访问时阻止注册；不透明源由浏览器自身禁止访问。保留页面错误、失败请求、超时、网络方法与 Git 离线限制。

增加沙箱 CSP 回归，修复前稳定失败；修复后普通跨域、沙箱跨域和 Service Worker 注册拦截均按图片像素及请求验证通过。`node --conditions=react-server --test tests/hosted-thumbnails.test.ts tests/thumbnails.test.ts` 共 6 项通过，类型检查、格式检查与生产构建通过。

使用真实 lynx-devloop 清单逐项生成六张 1440×900 图片均成功，并查看实际输出。未使用业务登录 Cookie。
