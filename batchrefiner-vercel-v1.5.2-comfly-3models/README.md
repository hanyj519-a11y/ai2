# BatchRefiner - Comfly 3 模型修正版

本包已按要求改成「不同 API 显示不同模型」。

## 模型规则

### Comfly API（按模型自动分组 / 4K修正版）
只保留 3 个模型：

- `gpt-image-2`
- `gemini-3.1-flash-image-preview`
- `nano-banana-pro`

已删除 Comfly 下的旧模型：

- `gemini-3.1-flash-image`

### 自定义 OpenAI兼容 API
保持不变：

- `gpt-image-2`
- `gemini-3.1-flash-image`

## 请求规则

- `gpt-image-2`：默认分组 `default`。
- `gemini-3.1-flash-image-preview`：Comfly 自动分组 `gemini-t3`。
- `nano-banana-pro`：Comfly 自动分组 `Gemini优质`。
- Comfly 下的 `gemini-3.1-flash-image-preview` 和 `nano-banana-pro` 按文档走 `/v1/images/generations`。
- 有参考图时，Comfly 的 Gemini / Nano 模型通过 JSON 的 `image` 数组传入参考图，不再走 `/v1/images/edits` multipart。
- 高清放大节点在 Comfly 下默认使用 `nano-banana-pro` + `4K`。

## 部署

Cloudflare Pages / Vercel 都可以使用原来的构建方式：

```bash
npm install
npm run build
```

Cloudflare Pages 推荐设置：

- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：默认项目根目录
