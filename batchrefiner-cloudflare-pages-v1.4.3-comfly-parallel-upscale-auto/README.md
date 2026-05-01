# BatchRefiner Cloudflare Pages v1.4.3 - Comfly API / 并行任务 / 高清放大免提示词版

## 本版改动

1. 已内置 Comfly API 平台：`https://ai.comfly.chat/v1`。
2. Comfly 生图默认模型：`gpt-image-2`，按平台 default 分组使用。
3. 生图模型列表更新为：
   - `gpt-image-2`
   - `gemini-3.1-flash-image-preview`
   - `nano-banana-pro-4k`
4. 反推/文本模型默认使用 Gemini 优质：`gemini-3.1-pro-preview`。
5. 路由规则：
   - `gpt-image-2` 无参考图：`/v1/images/generations`
   - `gpt-image-2` 有参考图 / 高清放大：`/v1/images/edits`
   - `gemini-3.1-flash-image-preview`、`nano-banana-pro-4k`：`/v1/chat/completions`
6. 多张图片生成改成并行发送请求，不再一张一张排队。
7. “全部运行 / 整组执行”会按依赖分层：互不依赖的节点并行运行，有上下游关系的节点会等上游完成后再运行。
8. 高清放大节点已改成免提示词：连接图片后直接点击“运行”，自动做清晰度、材质、边缘细节增强，并尽量保持原图尺寸、构图、主体位置不变。

## Cloudflare Pages 部署设置

```txt
Framework preset: Vite 或 None
Root directory: 留空 或 /
Install command: npm install --legacy-peer-deps
Build command: npm run build
Build output directory: dist
Node.js version: 20 或 22
```

注意：不要把 Root directory 填成 `dist`、`src`、`functions`。

## 使用方式

1. 部署完成后打开 Cloudflare Pages 地址。
2. 点击右上角「API 设置」。
3. 左侧选择「Comfly API（default分组）」。
4. API 地址已自动填好：`https://ai.comfly.chat/v1`。
5. 只需要填写你的 API 密钥。
6. 回到画布，双击空白处添加图片生成、高清放大或反推提示词节点。

## 如果旧版本缓存还在

如果你之前在同一个网址用过旧版，浏览器 localStorage 可能还保留旧平台。打开「API 设置」后，左侧选择「Comfly API（default分组）」即可；也可以删除旧的空白平台。
