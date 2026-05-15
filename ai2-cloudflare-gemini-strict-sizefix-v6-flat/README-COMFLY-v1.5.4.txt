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


补丁说明（手动追加）
- Gemini 图片模型 / nano-banana 类图片模型已统一改为走 /v1beta/models/{model}:generateContent 接口结构（适用于图片生成 / 多角度 / 高清放大节点）。
- 文本 Gemini 模型未改动。
- 历史记录已关闭自动保存，仅保留手动保存。


补丁说明 v1beta-fixed
- 图片节点内 gemini / nano-banana / nanobanana 类模型强制走 /v1beta/models/{model}:generateContent。
- API 地址即使误填成 /v1/images/generation、/v1/images/generations、/v1/images/edits，也会自动归一到域名根路径再拼 generateContent。
- 历史记录继续保持只手动保存，不自动保存。


补丁说明 force-v2
- 节点里手动填写的 gemini / nano-banana 模型，即使不在模型列表里，也会直接按 generateContent 路由。
- 页面底部版本显示 V1.5.14-gemini-force-v2，可用来确认是否部署了新包。

补丁说明 force-v3-visible
- 主 JS 文件已改名为 index-v1514-gemini-force-v3-visible.js，用来避开浏览器/Cloudflare 旧缓存。
- 页面底部版本应显示：v1.5.14-gemini-force-v3-visible / V1.5.14-gemini-force-v3。
- 图片节点里模型名只要包含 gemini、nano-banana、nanobanana，就强制走 /v1beta/models/{model}:generateContent。
- 历史记录为手动保存，不再监听自动保存事件。


补丁说明 base64fix-v4
- 修复 Gemini generateContent 参考图 inline_data.data 的 Base64 清洗：去掉 dataURL 前缀、去掉空白、补齐 = padding、兼容 URL-safe base64。
- 图片 part 改为 REST 格式 inline_data / mime_type，提升第三方 API 网关兼容性。
- Gemini / nano-banana 类图片模型继续强制走 /v1beta/models/{model}:generateContent。
- 历史记录仍然只手动保存。


补丁说明 strict-sizefix-v6
- 修复 sizefix-v5 中 Gemini image_config 同时传 snake_case/camelCase 导致 oneof 重复字段报错的问题。
- Gemini / nano-banana 的 generateContent 请求体改为严格 REST 字段：generation_config.image_config.aspect_ratio / image_size。
- 删除 image_config 内无效字段 size、resolution、quality。
- 仍保留提示词中的 2K/3K/4K 输出要求。
- 历史记录仍然只手动保存。
