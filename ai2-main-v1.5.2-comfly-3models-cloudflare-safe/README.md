# AI2 Comfly 3 Models - Cloudflare Safe

Cloudflare Pages 设置：

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 默认/项目根目录

这个包已预构建，package.json 不含依赖，不含 package-lock.json，用来避开 Cloudflare 上 npm clean-install 的 npm 10 崩溃问题。

模型规则：

- Comfly API（按模型自动分组 / 4K修正版）：`gpt-image-2`、`gemini-3.1-flash-image-preview`、`nano-banana-pro`
- 自定义 OpenAI兼容 API：`gpt-image-2`、`gemini-3.1-flash-image`
