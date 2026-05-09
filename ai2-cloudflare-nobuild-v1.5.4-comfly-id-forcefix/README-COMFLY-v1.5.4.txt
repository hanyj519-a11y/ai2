本版修复点：v1.5.4-comfly-id-forcefix

1. 修复“图片生成节点 / 高清放大节点选择 Comfly API 后，模型列表还是和自定义 OpenAI 一样”的问题。
2. 原因：旧版只通过 baseUrl 判断 Comfly；如果浏览器旧缓存把 Comfly 的 baseUrl 改空或改成代理地址，节点会误判成普通 OpenAI 兼容 API。
3. 本版改为按 id / 名称 / baseUrl 三重判断 Comfly，并强制恢复内置 Comfly baseUrl：https://ai.comfly.chat/v1，同时保留用户密钥。
4. Comfly 图片模型固定：gpt-image-2、gemini-3.1-flash-image-preview、nano-banana-pro。
5. 自定义 OpenAI兼容 API 图片模型保持不变：gpt-image-2、gemini-3.1-flash-image。
6. 免构建部署：Cloudflare Pages 根目录留空，构建命令留空，输出目录填 dist。

如果页面还不变，请打开：你的域名/?v=154force
或清除网站数据/localStorage 后再打开。
