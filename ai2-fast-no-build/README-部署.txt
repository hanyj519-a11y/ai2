这是免构建版：已经把 dist 编译结果放在根目录，不需要 npm install，不需要 npm run build。

Vercel：
- Framework Preset：Other
- Build Command：留空
- Install Command：留空
- Output Directory：. 或留空

Cloudflare Pages：
- Build command：留空
- Build output directory：.
- Root directory：项目根目录

接口代理：
- Vercel 使用 /api/proxy.js
- Cloudflare Pages 使用 /functions/api/proxy.js，对外地址仍是 /api/proxy

模型改动：
- Comfly API 只有：gpt-image-2、gemini-3.1-flash-image-preview、nano-banana-pro
- 自定义 OpenAI 兼容 API 模型未改
