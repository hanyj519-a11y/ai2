Cloudflare Pages 免安装/免构建版本

这个包已经包含 dist 构建产物，不需要 npm install，不需要 npm run build。

Cloudflare Pages 设置：
Root directory / 根目录：留空
Build command / 构建命令：留空，不要填 npm run build
Build output directory / 构建输出目录：dist

注意：
1. 这个包根目录没有 package.json，是故意的，避免 Cloudflare 执行 npm clean-install 导致部署很久或 npm 卡死。
2. functions/api/proxy.js 已保留，Cloudflare Pages 会把它作为 /api/proxy 接口部署。
3. 部署后用 域名/?v=153nobuild 强制刷新页面缓存。
4. 如果你用 GitHub 上传，直接把本目录里的 dist 和 functions 两个文件夹上传到仓库根目录。
