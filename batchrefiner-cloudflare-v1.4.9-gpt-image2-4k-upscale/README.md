# BatchRefiner v1.4.9 - gpt-image-2 4K 尺寸规则 + 高清放大重构 + Cloudflare 版

这是纯前端无限画布 AI 图片工具，支持 Vercel 和 Cloudflare Pages 部署。API 密钥只保存在浏览器 `localStorage`，不会写进代码仓库。

## 本版核心改动

### 1. gpt-image-2 尺寸规则已重构
界面仍然显示 `1k / 2k / 3k / 4k`，但真正发给 `/v1/images/generations` 和 `/v1/images/edits` 的 `size` 会自动计算成安全尺寸：

- 最大像素预算：`3840 × 2160`。
- 单边最长：`3840px`。
- 超过 `2560 × 1440` 的尺寸按实验性 3K/4K 处理。
- 宽高比最大：`3:1`，超出会自动压到可请求范围。
- 宽和高都会自动变成 `16px` 的整数倍。
- `3k / 4k` 不再直接粗暴放大到超预算尺寸，避免 `Invalid size ... exceeds the current pixel budget`。

示例：

- `4k + 16:9` → `3840x2160`
- `4k + 9:16` → `2160x3840`
- `4k + 1:1` → 约 `2880x2880`
- `4k + 3:4` → 自动压到 4K 像素预算内的安全 16px 尺寸

### 2. 高清放大节点已重构

- 默认模型改为：`gpt-image-2`。
- 默认尺寸：`4k`。
- 节点不需要填写提示词。
- 高清放大节点现在可以单独选择：API、模型、`1k / 2k / 3k / 4k`。
- 选择 `gpt-image-2` 时，高清放大也会使用同一套安全尺寸规则。
- 有参考图时走 `/v1/images/edits`，无参考图生成走 `/v1/images/generations`。

### 3. Cloudflare Pages 版已加入

项目里新增：

```txt
functions/api/proxy.js
public/_headers
public/_redirects
```

Cloudflare Pages 会使用 `functions/api/proxy.js` 处理 `/api/proxy?url=...`，用于转发 OpenAI 兼容接口，减少浏览器 CORS 问题。

## 模型与分组规则

图片模型列表：

- `gpt-image-2`
- `gemini-3.1-flash-image-preview`
- `gemini-3.1-flash-image-preview-4k`
- `nano-banana-pro`

文本/反推模型：

- `gemini-3.1-pro-preview`

Comfly 分组规则：

- `gpt-image-2` → `default`
- `gemini-3.1-flash-image-preview` → `gemini-t3`
- `gemini-3.1-flash-image-preview-4k` → `gemini-t3`
- `nano-banana-pro` → `Gemini优质`
- `gemini-3.1-pro-preview` → `Gemini优质`

## Vercel 部署设置

上传整个项目根目录，根目录里必须能看到：

```txt
package.json
src
api
vercel.json
```

Vercel 设置：

```txt
Framework Preset: Vite
Root Directory: 留空 或 /
Install Command: npm install --legacy-peer-deps
Build Command: npm run build
Output Directory: dist
Node.js Version: 20 或 22
```

## Cloudflare Pages 部署设置

上传整个项目根目录，根目录里必须能看到：

```txt
package.json
src
functions
public
```

Cloudflare Pages 设置：

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: 留空 或 /
Node.js version: 20 或 22
```

如果 Cloudflare 后台有环境变量设置，可以加：

```txt
NODE_VERSION = 22
```

部署成功后，如果打开首页 404，请确认：

```txt
Build output directory = dist
```

不要填成 `src`、`api`、`functions` 或项目根目录。

## 使用方式

1. 部署完成后打开网站。
2. 点击右上角「API 设置」。
3. 选择「Comfly API（按模型自动分组 / 4K修正版）」或自定义 OpenAI 兼容 API。
4. API 地址默认是：`https://ai.comfly.chat/v1`。
5. 填入你的 API 密钥。
6. 图片生成节点默认模型是 `gpt-image-2`。
7. 高清放大节点默认模型是 `gpt-image-2` + `4k`，连接图片后直接点「运行」。

## 构建验证

本包已执行：

```txt
npm install --legacy-peer-deps --no-audit --no-fund
npm run build
```

构建输出目录：`dist`。
