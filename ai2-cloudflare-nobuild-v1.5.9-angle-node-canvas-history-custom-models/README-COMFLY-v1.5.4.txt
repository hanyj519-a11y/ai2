本版修复点：v1.5.4-comfly-id-forcefix

1. 修复“图片生成节点 / 高清放大节点选择 Comfly API 后，模型列表还是和自定义 OpenAI 一样”的问题。
2. 原因：旧版只通过 baseUrl 判断 Comfly；如果浏览器旧缓存把 Comfly 的 baseUrl 改空或改成代理地址，节点会误判成普通 OpenAI 兼容 API。
3. 本版改为按 id / 名称 / baseUrl 三重判断 Comfly，并强制恢复内置 Comfly baseUrl：https://ai.comfly.chat/v1，同时保留用户密钥。
4. Comfly 图片模型固定：gpt-image-2、gemini-3.1-flash-image-preview、nano-banana-pro。
5. 自定义 OpenAI兼容 API 图片模型保持不变：gpt-image-2、gemini-3.1-flash-image。
6. 免构建部署：Cloudflare Pages 根目录留空，构建命令留空，输出目录填 dist。

如果页面还不变，请打开：你的域名/?v=154force
或清除网站数据/localStorage 后再打开。

---

v1.5.5-lovart-multiangle-history 追加说明

本版本在原 v1.5.4-comfly-id-forcefix 基础上追加了一个前端插件，不改变原来的节点和 API 设置：

1. 右下角新增「多角度」按钮
   - 类似 Lovart Multi-Angles：选择画布里的图片，切换主体模式/相机模式。
   - 可调水平旋转、垂直俯仰、镜头远近、比例、清晰度、数量。
   - 点击「生成多角度」后调用当前 API 设置里的图片编辑接口 /v1/images/edits。
   - 结果会自动保存到历史记录。

2. 右下角新增「历史记录」按钮
   - 自动监听原工具的图片生成接口返回结果，成功生成的图片会保存到浏览器本机 IndexedDB。
   - 关闭网页后再次打开仍可查看历史记录。
   - 支持打开预览、下载、复制提示词、删除单条、清空全部。
   - 支持手动「保存当前画布图片」。

3. 数据安全
   - API 密钥仍然只保存在原工具的 localStorage。
   - 历史图片只保存在当前浏览器 IndexedDB，不会上传到其他服务器。
   - 换浏览器、清浏览器数据、无痕模式会导致历史记录不可见或被清除。

4. Cloudflare Pages 设置
   - 构建命令：留空
   - 构建输出目录：dist
   - functions/api/proxy.js 继续保留，用于 API 代理。
