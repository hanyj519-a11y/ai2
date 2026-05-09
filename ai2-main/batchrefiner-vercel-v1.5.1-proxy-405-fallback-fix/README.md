# BatchRefiner Vercel / Comfly 模型列表修正版

这是给 Vercel 部署的纯前端版本，请求通过 `api/proxy.js` 转发到 Comfly，减少浏览器 CORS 问题。

## 本次修改

1. `Comfly API（按模型自动分组 / 4K修正版）` 的图片生成 / 高清放大模型列表改为 3 个：
   - `gpt-image-2`
   - `gemini-3.1-flash-image-preview`
   - `nano-banana-pro`

2. `自定义 OpenAI兼容 API` 的模型列表保持不变：
   - `gpt-image-2`
   - `gemini-3.1-flash-image`

3. 不同 API 使用不同模型列表：
   - 选择 Comfly 时，只显示 Comfly 的 3 个模型。
   - 选择自定义 OpenAI 兼容 API 时，只显示自定义 API 的 2 个模型。

4. Comfly 分组规则：
   - `gpt-image-2`：`default`
   - `gemini-3.1-flash-image-preview`：`gemini-t3`
   - `nano-banana-pro`：`Gemini优质`
   - `gemini-3.1-pro-preview` 反推提示词：`Gemini优质`

5. Comfly 非 gpt 图片模型已按你给的文档走 OpenAI Dall-e 格式：
   - 请求路径：`/v1/images/generations`
   - 无参考图：JSON 里发送 `model / prompt / response_format / aspect_ratio / image_size`
   - 有参考图：JSON 里增加 `image` 数组，内容为参考图 url 或 b64_json

6. 高清放大节点默认改为：`nano-banana-pro` + `4K`。

7. 旧缓存里的 `nano-banana-pro-4k` 会自动兼容为 `nano-banana-pro`；旧缓存里的 `gemini-3.1-flash-image-preview-4k` 会自动兼容为 `gemini-3.1-flash-image-preview`，但不会再出现在模型下拉框里。

## Vercel 部署

- Install Command：`npm install`
- Build Command：`npm run build`
- Output Directory：`dist`

## Cloudflare Pages 部署

- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：本项目根目录，也就是包含 `package.json` 的目录。

## 使用说明

1. 打开右上角「API 设置」。
2. 选择「Comfly API（按模型自动分组 / 4K修正版）」。
3. 填写你的 Comfly API 密钥。
4. 图片生成节点选择模型：`gpt-image-2`、`gemini-3.1-flash-image-preview`、`nano-banana-pro`。
5. 高清放大节点连接图片后直接运行，不需要填写提示词。
6. 自定义 OpenAI兼容 API 的模型没有改动，仍是 `gpt-image-2` 和 `gemini-3.1-flash-image`。
