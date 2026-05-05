# BatchRefiner Vercel v1.5.0 - 自定义 API default 分组修正版

这是给 Vercel 部署的纯前端版本，请求通过 `api/proxy.js` 转发到 Comfly，减少浏览器 CORS 问题。

## 本版改动

1. Comfly API（按模型自动分组 / 4K修正版）模型列表保持不变：
   - `gpt-image-2`（默认）
   - `gemini-3.1-flash-image-preview`
   - `gemini-3.1-flash-image-preview-4k`
   - `nano-banana-pro`
2. 自定义 OpenAI兼容 API 的图片生成节点和高清放大节点模型列表为：
   - `gpt-image-2`
   - `gemini-3.1-flash-image`
3. 自定义 OpenAI兼容 API 下，`gpt-image-2` 和 `gemini-3.1-flash-image` 都显式按 `default` 默认分组发送，不走 `gemini`、`gemini-t3` 或 `Gemini优质`。

原 v1.4.8-4K 主要改动：
4. 高清放大节点默认模型已改为：`gemini-3.1-flash-image-preview-4k`。
5. 高清放大节点默认使用：`4K`，并按“参考图 4K 重绘”逻辑工作。
6. Comfly 分组规则保持原自动分组逻辑：
   - `gpt-image-2`：走 `default` 分组。
   - `gemini-3.1-flash-image-preview` / `gemini-3.1-flash-image-preview-4k`：走 `gemini-t3` 分组。
   - `gemini-3.1-pro-preview` / `nano-banana-pro`：走 `Gemini优质` 分组。
5. 图片接口路由已重构：
   - 无参考图图片生成：`/v1/images/generations`
   - 有参考图图片生成：`/v1/images/edits`
   - 高清放大：`/v1/images/edits`
   - 反推提示词：`/v1/chat/completions`
6. Gemini / Nano Banana 图片模型不再强制走 `/v1/chat/completions` 生成图片，避免图片模型被错误路由到聊天接口。
7. Comfly 图片参数已按 DALL-E/OpenAI 兼容格式补充：`aspect_ratio`、`image_size`、`response_format`。
8. 旧缓存里的 `nano-banana-pro-4k` 会自动兼容为 `nano-banana-pro`。
9. 高清放大节点不需要填写提示词：可单独选择 API 和模型，连接图片后直接点击「运行」，自动用“参考图 4K 重绘”的方式输出大图，并尽量保持原图比例、构图、主体位置与细节不变。
10. 多张图片生成继续并行发送请求；运行日志会显示前端实际发送了几次请求。

## Vercel 部署设置

上传整个压缩包解压后的项目根目录，根目录里必须能看到 `package.json`、`src`、`api`、`vercel.json`。

Vercel 项目设置填写：

```txt
Framework Preset: Vite
Root Directory: 留空 或 /
Install Command: npm install --legacy-peer-deps
Build Command: npm run build
Output Directory: dist
Node.js Version: 20 或 22
```

不要把 Root Directory 填成 `dist`、`src`、`api`。

## 使用方式

1. 部署完成后打开 Vercel 网址。
2. 点击右上角「API 设置」。
3. 左侧选择「Comfly API（按模型自动分组）」。
4. API 地址已自动填好：`https://ai.comfly.chat/v1`。
5. 只需要填写你的 Comfly API 密钥。
6. 图片生成节点默认是 `gpt-image-2`。
7. 高清放大节点默认是 `gemini-3.1-flash-image-preview-4k` + `4K`，连接图片后直接点运行。

## 注意

- API 密钥只保存在浏览器 `localStorage`，不会写进代码仓库。
- 如果旧版本缓存还在，打开「API 设置」确认默认图片模型为 `gpt-image-2`；切换到「自定义 OpenAI兼容 API」时，模型列表只会显示 `gpt-image-2` 和 `gemini-3.1-flash-image`。
- `gemini-3.1-flash-image-preview` 在 `default` 分组会报 “No available channel”，所以本版改为自动走 `gemini-t3`。
- 如果你的 Comfly 令牌后台不能被请求参数切换分组，请在 Comfly 的令牌编辑里把对应令牌分组改到 `gemini-t3`，或用 `gpt-image-2` 作为 default 分组稳定模型。


## v1.4.8-4K 输出修正
- 基于 v1.4.8 调整，保留 gemini-t3 / Gemini优质 的自动分组逻辑。
- 高清放大节点默认 gemini-3.1-flash-image-preview-4k + 4K。
- Gemini/Comfly 4K 按 4096px 长边处理，并额外传入 image_config / generation_config 兼容字段。
- 如果上游接口成功返回但仍是小图，前端会自动把输出补齐到 4K 像素尺寸，避免下载结果不是大图。


## 本次高清放大节点重构
- 高清放大节点支持单独选择 API 和模型。
- 运行逻辑从“传统放大”改为“参考图 4K 重绘”。
- 默认仍为 `gemini-3.1-flash-image-preview-4k` + `4K`。
- 节点会优先要求模型按 4K 尺寸保真重绘；若返回图长边不足 4K，前端再补齐到 4K。
- 为减少 422，默认提示词改成更克制的英文保真重绘提示词，并在 422 时自动再试一次更短提示词。

- 修复：`gpt-image-2` 在 `/v1/images/edits` 使用 3k / 4k 时，自动按像素预算压缩到安全尺寸，避免出现 `Invalid size ... exceeds the current pixel budget`。
