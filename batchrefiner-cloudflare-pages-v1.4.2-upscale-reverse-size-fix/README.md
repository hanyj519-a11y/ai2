# BatchRefiner Cloudflare Pages v1.4.2 - 高清放大 / 反推 / gpt-image-2 尺寸修复版

这版在 v1.4.1 Cloudflare 404 修复版基础上，继续优化画布节点能力。

## 必须这样部署

Cloudflare Pages 设置：

```txt
Framework preset: Vite 或 None
Root directory: 留空 或 /
Install command: npm install --legacy-peer-deps
Build command: npm run build
Build output directory: dist
Node.js version: 20 或 22
```

注意：不要把 Root directory 填成 `dist`、`src`、`functions`。
不要把 Build output directory 填成 `/`、`./`、`public`。

## 这版改了什么

1. 新增「高清放大节点」：右键/双击画布添加节点时可选择，连接图片后运行；默认模型为 `gemini-3.1-flash-image`。
2. 高清放大节点会在请求里要求保持原图尺寸、比例、构图、主体位置和内容不变，只做清晰度、材质、边缘和细节增强。
3. 修复 `gpt-image-2` 尺寸换算：界面仍显示 `3k`、`4k`，但实际请求时 `3k` 最大边为 `3072`，`4k` 最大边为 `3840`。
4. 兼容 `gpt-image-2-4k`：界面保留该选项，但实际请求会转成 `gpt-image-2`，通过 3k/4k 尺寸控制清晰度，避免部分 New API 平台报 “Use gpt-image-2”。
5. 优化「反推提示词节点」输出：先给【简略总览】，再给【详细提示词】，包含主体场景、构图镜头、光影色彩、材质细节、人物动作、风格质感、负面限制。
6. 保留 Cloudflare Pages Functions 代理：前端仍然请求 `/api/proxy?url=...`。

## 使用方式

1. 部署完成后打开 Cloudflare Pages 地址。
2. 点击「API 设置」。
3. API 地址填写例如：

```txt
https://figure.jiangsuocean.cn/v1
```

4. 填写 API 密钥，回到画布运行。
5. 双击画布空白处，选择「高清放大节点」，把图片节点连到高清放大节点左侧，然后点击运行。

## 如果仍然 404

99% 是 Cloudflare 项目设置问题：

- Root directory 必须留空或 `/`
- Build command 必须是 `npm run build`
- Build output directory 必须是 `dist`
- 部署日志里必须能看到生成了 `dist/index.html`
