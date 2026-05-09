# BatchRefiner / Comfly 3 模型修正版

这是给 Vercel 部署的纯前端版本，请求通过 `api/proxy.js` 转发到 Comfly，减少浏览器 CORS 问题。

## 本次修改

1. `Comfly API（按模型自动分组 / 4K修正版）` 下的图片模型固定为 3 个：
   - `gpt-image-2`（默认分组 `default`）
   - `gemini-3.1-flash-image-preview`（自动走 `gemini-t3`）
   - `nano-banana-pro`（自动走 `Gemini优质`）

2. 删除 / 不再显示 Comfly 下的旧模型：
   - `gemini-3.1-flash-image`
   - `gemini-3.1-flash-image-preview-4k`
   - `nano-banana-pro-4k`

3. `自定义 OpenAI兼容 API` 下的图片生成节点和高清放大节点模型保持不变：
   - `gpt-image-2`
   - `gemini-3.1-flash-image`

4. 不同 API 下显示不同模型：
   - 选择 Comfly API：只显示 Comfly 的 3 个模型。
   - 选择自定义 OpenAI兼容 API：只显示原来的 2 个模型。

5. Comfly 的 `gemini-3.1-flash-image-preview` 已按文档 2 对接：
   - 路径：`/v1/images/generations`
   - 请求字段：`model`、`prompt`、`response_format`、`aspect_ratio`、`image`、`image_size`

6. Comfly 的 `nano-banana-pro` 已按 pro 文档对接：
   - 路径：`/v1/images/generations`
   - 请求字段：`model`、`prompt`、`response_format`、`aspect_ratio`、`image`、`image_size`

7. 有参考图时，Comfly 的 `gemini-3.1-flash-image-preview` 和 `nano-banana-pro` 不再走 `/v1/images/edits`，而是继续走 `/v1/images/generations`，参考图通过 JSON 的 `image` 数组传入。

8. 高清放大节点在 Comfly API 下默认改为：
   - `nano-banana-pro`
   - `4K`

9. 旧缓存兼容：
   - 旧的 `gemini-3.1-flash-image-preview-4k` 会自动兼容到 `gemini-3.1-flash-image-preview`。
   - 旧的 `nano-banana-pro-4k` 会自动兼容到 `nano-banana-pro`。
   - 但下拉框不会再把旧模型重新插入。

## 部署

### Vercel

- Framework Preset：Vite
- Build Command：`npm run build`
- Output Directory：`dist`

### Cloudflare Pages

- Build command：`npm run build`
- Build output directory：`dist`

## 使用

1. 打开页面右上角「API 设置」。
2. 选择「Comfly API（按模型自动分组 / 4K修正版）」或「自定义 OpenAI兼容 API」。
3. Comfly API 已内置：`https://ai.comfly.chat/v1`。
4. 只需要填写你的 Comfly API 密钥。
5. API 密钥只保存在浏览器 localStorage，不上传到本项目服务器。



## v1.5.3 节点模型硬修复

- 图片生成节点、高清放大节点现在会按节点当前 API 强制刷新模型列表。
- Comfly API 下只显示：`gpt-image-2`、`gemini-3.1-flash-image-preview`、`nano-banana-pro`。
- 自定义 OpenAI兼容 API 下仍只显示：`gpt-image-2`、`gemini-3.1-flash-image`。
- 旧节点里如果残留 `gemini-3.1-flash-image`、`gemini-3.1-flash-image-preview-4k`、`nano-banana-pro-4k`，会在 Comfly API 下自动校正。
- 运行日志新增“分组”显示，方便确认是否真的走 `default` / `gemini-t3` / `Gemini优质`。
- Comfly 的 `gemini-3.1-flash-image-preview` 和 `nano-banana-pro` 均按文档走 `/v1/images/generations`，有参考图时通过 JSON 的 `image` 数组传入。
