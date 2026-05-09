这个版本是“快速部署保险版”：
即使平台强制执行 npm run build，也不会报 Missing script: build。

Cloudflare Pages 推荐设置：
1. Build command：npm run build
2. Build output directory：dist
3. Root directory：保持默认/项目根目录

如果你想完全免构建：
1. Build command：留空 或 echo skip
2. Build output directory：.

Vercel 推荐设置：
1. Framework Preset：Other
2. Build Command：npm run build 或留空
3. Output Directory：dist 或 .

模型修改：
Comfly API 只有：gpt-image-2 / gemini-3.1-flash-image-preview / nano-banana-pro
OpenAI兼容 API 保持不变。
