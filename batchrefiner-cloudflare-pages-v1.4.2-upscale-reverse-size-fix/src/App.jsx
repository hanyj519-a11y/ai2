import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  getConnectedEdges,
  getIncomers,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Settings,
  Play,
  Plus,
  Image as ImageIcon,
  Sparkles,
  Wand2,
  Download,
  Upload,
  Trash2,
  Copy,
  Boxes,
  Ungroup,
  AlignLeft,
  AlignStartHorizontal,
  Columns3,
  Rows3,
  Grid2X2,
  Crosshair,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  Link as LinkIcon,
  Eye,
  FolderDown,
  Clipboard,
  MousePointer2,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'batchrefiner_openai_endpoint_settings_v2';
const DEFAULT_PLATFORM_ID = 'blank-openai-compatible-platform';
const IMAGE_MODEL_OPTIONS = [
  'gemini-3.1-flash-image',
  'gpt-image-2',
  'gpt-image-2-4k',
];
const TEXT_MODEL_OPTIONS = ['gemini-3.1-pro-preview'];
const RATIOS = ['1:1', '2:3', '3:4', '9:16', '16:9', '4:3', '3:2'];
const QUALITIES = ['1k', '2k', '3k', '4k'];
const COUNTS = [1, 2, 3, 4];
const UPSCALE_DEFAULT_MODEL = 'gemini-3.1-flash-image';
const GPT_IMAGE_SIZE_MAX_EDGE = { '1k': 1024, '2k': 2048, '3k': 3072, '4k': 3840 };

const DEFAULT_PLATFORMS = [
  {
    id: DEFAULT_PLATFORM_ID,
    name: 'OpenAI兼容 API',
    baseUrl: '',
    apiKey: '',
  },
];

const DEFAULT_SETTINGS = {
  platforms: DEFAULT_PLATFORMS,
  activePlatformId: DEFAULT_PLATFORM_ID,
  defaultTextModel: 'gemini-3.1-pro-preview',
  defaultImageModel: 'gpt-image-2',
};

const initialNodes = [
  {
    id: 'welcome-text',
    type: 'textNode',
    position: { x: -120, y: 80 },
    data: {
      title: '全局提示词',
      text: '图1的蓝色锅全部替换成图2白底图的红色渐变，如果图中已经有红锅就与蓝锅互换位置',
    },
  },
  {
    id: 'starter-generator',
    type: 'generateNode',
    position: { x: 260, y: 68 },
    data: {
      title: '图片生成',
      prompt: '保留原图构图和光影，生成高端厨房场景商业摄影图。',
      platformId: DEFAULT_PLATFORM_ID,
      model: 'gpt-image-2',
      ratio: '3:4',
      quality: '1k',
      count: 1,
      advancedOpen: false,
      upstreamImages: [],
      status: '等待运行',
    },
  },
];

const initialEdges = [
  {
    id: 'welcome-text-to-starter-generator',
    source: 'welcome-text',
    target: 'starter-generator',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    style: { strokeWidth: 2 },
    data: { selectedMiddle: false },
  },
];

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mergeDefaultPlatforms(savedPlatforms = []) {
  const byId = new Map();
  DEFAULT_PLATFORMS.forEach((platform) => byId.set(platform.id, platform));
  savedPlatforms.forEach((platform) => {
    if (!platform?.id) return;
    byId.set(platform.id, { ...(byId.get(platform.id) || {}), ...platform });
  });
  return Array.from(byId.values());
}

function loadSettings() {
  const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
  if (!saved) return DEFAULT_SETTINGS;
  const platforms = mergeDefaultPlatforms(saved.platforms?.length ? saved.platforms : []);
  const activeStillExists = platforms.some((item) => item.id === saved.activePlatformId);
  const savedTextModel = TEXT_MODEL_OPTIONS.includes(saved.defaultTextModel)
    ? saved.defaultTextModel
    : DEFAULT_SETTINGS.defaultTextModel;
  const savedImageModel = IMAGE_MODEL_OPTIONS.includes(saved.defaultImageModel)
    ? saved.defaultImageModel
    : DEFAULT_SETTINGS.defaultImageModel;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    platforms,
    activePlatformId: activeStillExists ? saved.activePlatformId : DEFAULT_SETTINGS.activePlatformId,
    defaultTextModel: savedTextModel,
    defaultImageModel: savedImageModel,
  };
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
}

function normalizeEndpointPath(path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  return cleanPath.replace(/^\/v1(?=\/|$)/i, '');
}

function stripKnownEndpoint(base) {
  const endpointNames = ['chat/completions', 'images/generations', 'images/edits', 'images/variations', 'models'];
  for (const name of endpointNames) {
    if (base.endsWith(`/${name}`)) {
      return base.replace(new RegExp(`/${name}$`), '');
    }
  }
  return base;
}

function buildEndpoint(baseUrl, path) {
  const rawBase = normalizeBaseUrl(baseUrl);
  if (!rawBase) return '';
  const cleanPath = normalizeEndpointPath(path);
  let base = stripKnownEndpoint(rawBase);
  if (!/\/v1$/i.test(base)) base = `${base}/v1`;
  return `${base}${cleanPath}`;
}

function buildPlatformEndpoint(platformOrBaseUrl, path) {
  const baseUrl = typeof platformOrBaseUrl === 'object' ? platformOrBaseUrl?.baseUrl : platformOrBaseUrl;
  return buildEndpoint(baseUrl, path);
}

function headers(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || ''}`,
  };
}

function stripDataPrefix(dataUrl) {
  if (!dataUrl) return '';
  return dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl;
}

function isDataImage(value) {
  return typeof value === 'string' && value.startsWith('data:image');
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function normalizeImageSource(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return '';
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/\s+/g, '');
  if (
    compact.length > 200 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact) &&
    (compact.startsWith('/9j/') || compact.startsWith('iVBOR') || compact.startsWith('R0lGOD') || compact.startsWith('UklGR') || compact.startsWith('PHN2Zy'))
  ) {
    const mime = compact.startsWith('/9j/')
      ? 'image/jpeg'
      : compact.startsWith('R0lGOD')
        ? 'image/gif'
        : compact.startsWith('UklGR')
          ? 'image/webp'
          : compact.startsWith('PHN2Zy')
            ? 'image/svg+xml'
            : 'image/png';
    return `data:${mime};base64,${compact}`;
  }
  return '';
}

function pushImageCandidate(results, value) {
  const normalized = normalizeImageSource(value);
  if (normalized) results.push(normalized);
}

function uniqueImages(images = []) {
  const seen = new Set();
  return images
    .map((item) => normalizeImageSource(item))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteLength(dataUrl) {
  const compact = stripDataPrefix(dataUrl).replace(/\s+/g, '');
  if (!compact) return 0;
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('压缩图片失败'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法压缩这张图片'));
    }, type, quality);
  });
}

function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，无法压缩'));
    image.src = dataUrl;
  });
}

async function renderImageToJpegBlob(image, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

async function compressDataUrlForReference(dataUrl, options = {}) {
  if (!isDataImage(dataUrl)) return dataUrl;
  const targetBytes = options.targetBytes || 700 * 1024;
  const minEdge = options.minEdge || 640;
  const originalBytes = dataUrlByteLength(dataUrl);
  if (originalBytes && originalBytes <= targetBytes) return dataUrl;

  try {
    const image = await loadDataUrlImage(dataUrl);
    const naturalWidth = image.naturalWidth || image.width || 1024;
    const naturalHeight = image.naturalHeight || image.height || 1024;
    const longest = Math.max(naturalWidth, naturalHeight);
    const startingMaxEdge = options.maxEdge || 1280;
    let maxEdge = Math.min(longest, startingMaxEdge);
    let bestBlob = null;

    while (maxEdge >= minEdge) {
      const scale = Math.min(1, maxEdge / longest);
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      let quality = options.initialQuality || 0.84;

      while (quality >= (options.minQuality || 0.56)) {
        // eslint-disable-next-line no-await-in-loop
        const blob = await renderImageToJpegBlob(image, width, height, quality);
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= targetBytes) return blobToDataUrl(blob);
        quality -= 0.08;
      }
      maxEdge = Math.round(maxEdge * 0.82);
    }

    if (bestBlob && (!originalBytes || bestBlob.size < originalBytes)) return blobToDataUrl(bestBlob);
    return dataUrl;
  } catch {
    return dataUrl;
  }
}

async function prepareReferenceImagesForApi(images) {
  const refs = uniqueImages(images || []);
  const dataImageCount = Math.max(1, refs.filter(isDataImage).length);
  // OpenAI 兼容 edits 需要 multipart 图片文件。这里统一压缩本地参考图，减少 413 和超时。
  const targetBytes = Math.max(260 * 1024, Math.floor((1280 * 1024) / dataImageCount));
  const maxEdge = targetBytes < 420 * 1024 ? 960 : targetBytes < 760 * 1024 ? 1280 : 1600;
  const prepared = [];
  for (let index = 0; index < refs.length; index += 1) {
    const item = refs[index];
    if (isDataImage(item)) {
      // eslint-disable-next-line no-await-in-loop
      prepared.push(await compressDataUrlForReference(item, { targetBytes, maxEdge }));
    } else {
      prepared.push(item);
    }
  }
  return uniqueImages(prepared);
}

function ratioToSize(ratio, quality) {
  const baseMap = {
    '1:1': [1024, 1024],
    '2:3': [1024, 1536],
    '3:4': [1024, 1365],
    '9:16': [1024, 1792],
    '16:9': [1792, 1024],
    '4:3': [1365, 1024],
    '3:2': [1536, 1024],
  };
  const multiplier = quality === '4k' ? 4 : quality === '3k' ? 3 : quality === '2k' ? 2 : 1;
  const [w, h] = baseMap[ratio] || baseMap['1:1'];
  return `${Math.round(w * multiplier)}x${Math.round(h * multiplier)}`;
}

function ratioToAspectRatio(ratio) {
  return ratio && ratio !== '自适应' ? ratio : '';
}

function ratioToOpenAIImageSize(ratio, quality) {
  if (!ratio || ratio === '自适应') return 'auto';
  const baseByQuality = GPT_IMAGE_SIZE_MAX_EDGE[String(quality || '1k').toLowerCase()] || GPT_IMAGE_SIZE_MAX_EDGE['1k'];
  const [rw, rh] = String(ratio).split(':').map((value) => Number(value));
  if (!rw || !rh) return 'auto';
  let width;
  let height;
  if (rw >= rh) {
    width = baseByQuality;
    height = Math.round((baseByQuality * rh) / rw);
  } else {
    height = baseByQuality;
    width = Math.round((baseByQuality * rw) / rh);
  }
  const round16 = (value) => Math.max(256, Math.round(value / 16) * 16);
  width = round16(width);
  height = round16(height);
  const maxEdge = Math.max(width, height);
  if (maxEdge > baseByQuality) {
    const scale = baseByQuality / maxEdge;
    width = round16(width * scale);
    height = round16(height * scale);
  }
  return `${width}x${height}`;
}

function reduceRatio(width, height) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(safeWidth, safeHeight);
  return `${Math.round(safeWidth / divisor)}:${Math.round(safeHeight / divisor)}`;
}

function clampImageSizeToMaxEdge(width, height, maxEdge = 3840) {
  const originalWidth = Math.max(1, Math.round(Number(width) || 0));
  const originalHeight = Math.max(1, Math.round(Number(height) || 0));
  if (!originalWidth || !originalHeight) return 'auto';
  const round16 = (value) => Math.max(256, Math.round(value / 16) * 16);
  const longest = Math.max(originalWidth, originalHeight);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return `${round16(originalWidth * scale)}x${round16(originalHeight * scale)}`;
}

function qualityToOpenAIQuality(quality) {
  if (quality === '4k' || quality === '3k') return 'high';
  if (quality === '2k') return 'medium';
  return 'auto';
}

function qualityToImageSize(quality) {
  return String(quality || '1k').toUpperCase();
}

function findImagesDeep(value, results = []) {
  if (!value) return results;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    pushImageCandidate(results, trimmed);
    const markdownMatches = trimmed.match(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g) || [];
    markdownMatches.forEach((item) => {
      const match = item.match(/\(([^)]+)\)/);
      if (match?.[1]) pushImageCandidate(results, match[1]);
    });
    const dataMatches = trimmed.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/g) || [];
    dataMatches.forEach((item) => pushImageCandidate(results, item));
    const labeledUrlMatches = trimmed.match(/https?:\/\/[^\s"')<>]+/gi) || [];
    labeledUrlMatches.forEach((item) => {
      if (/\.(png|jpg|jpeg|webp|gif|avif|svg)(\?|#|$)/i.test(item) || /\/image|\/images|\/file|\/files|\/media|\/asset|\/assets/i.test(item)) {
        pushImageCandidate(results, item);
      }
    });
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => findImagesDeep(item, results));
    return results;
  }
  if (typeof value === 'object') {
    if (typeof value.b64_json === 'string') pushImageCandidate(results, value.b64_json);
    if (typeof value.b64 === 'string') pushImageCandidate(results, value.b64);
    if (typeof value.base64 === 'string') pushImageCandidate(results, value.base64);
    if (typeof value.image === 'string') pushImageCandidate(results, value.image);
    if (typeof value.imageData === 'string') pushImageCandidate(results, value.imageData);
    if (typeof value.image_data === 'string') pushImageCandidate(results, value.image_data);
    if (typeof value.data === 'string' && value.mime_type?.startsWith?.('image/')) {
      pushImageCandidate(results, `data:${value.mime_type};base64,${value.data}`);
    }
    if (typeof value.data === 'string' && value.mimeType?.startsWith?.('image/')) {
      pushImageCandidate(results, `data:${value.mimeType};base64,${value.data}`);
    }
    if (typeof value.url === 'string') pushImageCandidate(results, value.url);
    if (value.image_url) {
      if (typeof value.image_url === 'string') pushImageCandidate(results, value.image_url);
      if (typeof value.image_url?.url === 'string') pushImageCandidate(results, value.image_url.url);
    }
    if (value.content?.type?.startsWith?.('image/') && typeof value.content?.data === 'string') {
      pushImageCandidate(results, `data:${value.content.type};base64,${value.content.data}`);
    }
    Object.values(value).forEach((item) => findImagesDeep(item, results));
  }
  return results;
}

function findTextDeep(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(findTextDeep).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    return Object.values(value).map(findTextDeep).filter(Boolean).join('\n');
  }
  return '';
}

function isLocalDevHost() {
  if (typeof window === 'undefined') return true;
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
}

function shouldUseApiProxy(targetUrl = '') {
  if (typeof window === 'undefined' || isLocalDevHost()) return false;
  if (typeof targetUrl === 'string' && targetUrl.startsWith('/')) return false;
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function buildProxyUrl(targetUrl) {
  return shouldUseApiProxy(targetUrl) ? `/api/proxy?url=${encodeURIComponent(targetUrl)}` : targetUrl;
}

function explainNetworkError(error) {
  const raw = error?.message || String(error || '');
  if (/FUNCTION_PAYLOAD_TOO_LARGE|Request Entity Too Large|Payload Too Large|413/i.test(raw)) {
    return '请求图片超过上游接口限制。请减少参考图数量，或先用 1k 生成。';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return '网络请求失败。已走 OpenAI 兼容代理路径；请检查 API 地址是否正确、接口是否支持 CORS/代理访问，或上游服务是否超时。';
  }
  return raw;
}

async function readJsonResponse(res) {
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const compactText = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
    const message = json?.error?.message || json?.message || compactText || `HTTP ${res.status}`;
    throw new Error(`HTTP ${res.status}：${message}`);
  }
  return json;
}

async function apiFetch(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = buildProxyUrl(url);
  try {
    return await fetch(requestUrl, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒） 实际请求地址：${requestUrl || url}`);
    }
    const hint = explainNetworkError(error, requestUrl);
    throw new Error(`${hint} 实际请求地址：${requestUrl || url}`);
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchJson(url, body, apiKey, timeoutMs = 600000) {
  const requestUrl = buildProxyUrl(url);
  const res = await apiFetch(url, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  }, timeoutMs);
  try {
    return await readJsonResponse(res);
  } catch (error) {
    throw new Error(`${error.message} 实际请求地址：${requestUrl || url}`);
  }
}

async function fetchFormJson(url, formData, apiKey, timeoutMs = 600000) {
  const requestUrl = buildProxyUrl(url);
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey || ''}` },
    body: formData,
  }, timeoutMs);
  try {
    return await readJsonResponse(res);
  } catch (error) {
    throw new Error(`${error.message} 实际请求地址：${requestUrl || url}`);
  }
}

async function dataUrlToFile(dataUrl, index) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const ext = blob.type?.includes('jpeg') ? 'jpg' : blob.type?.includes('webp') ? 'webp' : blob.type?.includes('gif') ? 'gif' : 'png';
  return new File([blob], `reference-${index + 1}.${ext}`, { type: blob.type || 'image/png' });
}

function buildImageReferencePrompt(prompt, count, ratio, quality, imageCount) {
  const imageGuide = imageCount
    ? `

上游已连接 ${imageCount} 张参考图。请严格把它们按连接顺序理解为：${Array.from({ length: imageCount }, (_, index) => `图${index + 1}`).join('、')}。如果提示词提到“图一/图1/第一张”，就是第 1 张参考图；提到“图二/图2/第二张”，就是第 2 张参考图。生成时必须明确参考这些上游图片，不要只根据文字想象。`
    : '';
  return `${prompt}${imageGuide}

本次只生成 ${count} 张完整图片。不要把多张结果拼接到同一张画布里，也不要做成上下拼图。画面比例：${ratio || '1:1'}。画质：${quality || '1k'}。`;
}

function getActivePlatform(settings) {
  return settings.platforms.find((item) => item.id === settings.activePlatformId) || settings.platforms[0];
}

function getPlatformById(settings, platformId) {
  return settings?.platforms?.find((item) => item.id === platformId) || getActivePlatform(settings);
}

function getImageModelOptions(_platform, currentModel = '') {
  return currentModel && !IMAGE_MODEL_OPTIONS.includes(currentModel) ? [currentModel, ...IMAGE_MODEL_OPTIONS] : IMAGE_MODEL_OPTIONS;
}

function getTextModelOptions(_platform, currentModel = '') {
  return currentModel && !TEXT_MODEL_OPTIONS.includes(currentModel) ? [currentModel, ...TEXT_MODEL_OPTIONS] : TEXT_MODEL_OPTIONS;
}

function getPlatformLabel(platform) {
  return platform?.name || '选择 API';
}

function sameStringList(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function validateApi(settings, platformId) {
  const platform = getPlatformById(settings, platformId);
  if (!platform?.baseUrl) throw new Error('请先在右上角「API 设置」填写 API 地址。');
  if (!platform?.apiKey) throw new Error(`请先在右上角「API 设置」给「${getPlatformLabel(platform)}」填写 API 密钥。`);
  return platform;
}

function isGptImageModel(model) {
  return String(model || '').toLowerCase().includes('gpt-image');
}

function isGptImage4kModel(model) {
  return String(model || '').toLowerCase().includes('gpt-image-2-4k');
}

function supportsImagesApiGeneration(model) {
  const name = String(model || '').toLowerCase();
  return name === 'gpt-image-2' || name === 'gpt-image-2-4k';
}

function supportsChatImageGeneration(model) {
  const name = String(model || '').toLowerCase();
  return name === 'gemini-3.1-flash-image';
}

function normalizeImageRequestModel(model) {
  const name = String(model || '').toLowerCase();
  // 兼容部分 New API / MathModel 平台：界面可保留 gpt-image-2-4k，实际请求仍走 gpt-image-2，并用 4k/3k 尺寸控制清晰度。
  if (name === 'gpt-image-2-4k') return 'gpt-image-2';
  return model;
}

function extractFirstReturnedImage(json, inputImages = []) {
  const images = uniqueImages(findImagesDeep(json));
  const sameAsInput = images.length === 1 && inputImages.includes(images[0]);
  if (sameAsInput) throw new Error('接口返回的是原始参考图，疑似没有真正执行图片处理。');
  if (images.length) return images[0];
  const textReply = findTextDeep(json).slice(0, 800);
  throw new Error(textReply || '接口返回了内容，但没有解析到图片。');
}

function getImageDimensions(source) {
  return new Promise((resolve) => {
    if (!source || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      resolve(width && height ? { width, height } : null);
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function imageSourceToFile(source, index = 0) {
  if (isDataImage(source)) return dataUrlToFile(source, index);
  if (isHttpUrl(source)) {
    const response = await apiFetch(buildProxyUrl(source), { method: 'GET' }, 120000);
    if (!response.ok) throw new Error(`参考图下载失败：HTTP ${response.status}`);
    const blob = await response.blob();
    const mime = blob.type || 'image/png';
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    return new File([blob], `reference-${index + 1}.${ext}`, { type: mime });
  }
  throw new Error('参考图格式不支持，请使用上传图片或可访问的图片 URL。');
}

async function generateImagesWithApi({ settings, nodeData, upstreamText, upstreamImages, onRequest }) {
  const platform = validateApi(settings, nodeData.platformId);
  const prompt = [upstreamText, nodeData.prompt].filter(Boolean).join('\n\n').trim();
  if (!prompt) throw new Error('这个图片生成节点没有提示词，请先输入提示词或连接文本节点。');

  const requestedCount = Math.max(1, Number(nodeData.count || 1));
  const selectedModel = IMAGE_MODEL_OPTIONS.includes(nodeData.model) ? nodeData.model : settings.defaultImageModel;
  const imageInputs = uniqueImages(upstreamImages || []);
  const apiImageInputs = await prepareReferenceImagesForApi(imageInputs);
  const ratio = nodeData.ratio || '1:1';
  const quality = nodeData.quality || (isGptImage4kModel(selectedModel) ? '4k' : '1k');

  const buildModelConfig = (requestModel) => {
    const apiModel = normalizeImageRequestModel(requestModel);
    const gptImage = isGptImageModel(apiModel);
    const openAIImageSize = ratioToOpenAIImageSize(ratio, quality);
    const genericSize = ratioToSize(ratio, quality);
    return {
      requestModel: apiModel,
      size: gptImage ? openAIImageSize : genericSize,
      requestQuality: gptImage ? qualityToOpenAIQuality(quality) : quality,
    };
  };

  const runSingleGeneration = async () => {
    const singlePrompt = buildImageReferencePrompt(prompt, 1, ratio, quality, imageInputs.length);


    const runImagesGeneration = async (requestModel) => {
      const { requestModel: apiModel, size, requestQuality } = buildModelConfig(requestModel);
      const body = {
        model: apiModel,
        prompt: singlePrompt,
        n: 1,
        size,
        quality: requestQuality,
      };
      const endpoint = buildPlatformEndpoint(platform, '/images/generations');
      onRequest?.(endpoint);
      const json = await fetchJson(endpoint, body, platform.apiKey, 600000);
      return extractFirstReturnedImage(json);
    };

    const runImagesEdit = async (requestModel) => {
      const { requestModel: apiModel, size, requestQuality } = buildModelConfig(requestModel);
      const formData = new FormData();
      formData.append('model', apiModel);
      formData.append('prompt', singlePrompt);
      formData.append('n', '1');
      formData.append('size', size);
      formData.append('quality', requestQuality);
      const files = await Promise.all(apiImageInputs.map((image, index) => imageSourceToFile(image, index)));
      if (!files.length) throw new Error('没有可用的参考图文件。');
      files.forEach((file) => formData.append('image', file));
      const endpoint = buildPlatformEndpoint(platform, '/images/edits');
      onRequest?.(endpoint);
      const json = await fetchFormJson(endpoint, formData, platform.apiKey, 600000);
      return extractFirstReturnedImage(json, imageInputs);
    };

    const runChatGeneration = async (requestModel) => {
      const { size, requestQuality } = buildModelConfig(requestModel);
      const content = [{ type: 'text', text: singlePrompt }];
      apiImageInputs.forEach((url, index) => {
        content.push({ type: 'text', text: `参考图${index + 1}：请务必读取并参与生成。` });
        content.push({ type: 'image_url', image_url: { url } });
      });
      const body = {
        model: requestModel,
        stream: false,
        messages: [{ role: 'user', content }],
        modalities: ['text', 'image'],
        n: 1,
        size,
        quality: requestQuality,
        aspect_ratio: ratio,
      };
      const endpoint = buildPlatformEndpoint(platform, '/chat/completions');
      onRequest?.(endpoint);
      const json = await fetchJson(endpoint, body, platform.apiKey, 600000);
      return extractFirstReturnedImage(json, apiImageInputs.length > 0 ? imageInputs : []);
    };

    if (supportsChatImageGeneration(selectedModel)) {
      return await runChatGeneration(selectedModel);
    }

    if (supportsImagesApiGeneration(selectedModel)) {
      if (apiImageInputs.length) {
        return await runImagesEdit(selectedModel);
      }
      return await runImagesGeneration(selectedModel);
    }

    throw new Error(`当前模型 ${selectedModel} 没有可用的图片生成路由。`);
  };

  const results = [];
  for (let index = 0; index < requestedCount; index += 1) {
    const image = await runSingleGeneration();
    const normalized = normalizeImageSource(image);
    if (!normalized) throw new Error(`第 ${index + 1} 张结果没有成功解析成图片。`);
    results.push(normalized);
  }
  return results;
}


async function upscaleImageWithApi({ settings, nodeData, upstreamImages, onRequest }) {
  const platform = validateApi(settings, nodeData.platformId);
  const firstImage = uniqueImages(upstreamImages || [])[0];
  if (!firstImage) throw new Error('高清放大节点需要先连接一张图片。');

  const selectedModel = IMAGE_MODEL_OPTIONS.includes(nodeData.model) ? nodeData.model : UPSCALE_DEFAULT_MODEL;
  const requestModel = normalizeImageRequestModel(selectedModel);
  const apiImageInputs = await prepareReferenceImagesForApi([firstImage]);
  const apiImage = apiImageInputs[0] || firstImage;
  const dimensions = await getImageDimensions(firstImage);
  const dimensionText = dimensions
    ? `原图像素尺寸为 ${dimensions.width}x${dimensions.height}，输出必须保持同样的宽高比例与像素尺寸，不要扩图、不要裁切、不要改变主体位置。`
    : '输出必须保持原图宽高比例、构图边界和主体位置，不要扩图、不要裁切。';
  const customPrompt = String(nodeData.prompt || '').trim();
  const prompt = `${customPrompt || '请把这张图片做高清细节增强：提升清晰度、边缘锐利度、材质纹理和商业摄影质感，降低噪点与压缩痕迹。'}

硬性要求：${dimensionText} 保持原图内容、颜色关系、构图、人物/产品结构完全一致；不要新增文字、不要换背景、不要重绘成另一张图。只输出处理后的单张图片。`;

  const runChatUpscale = async () => {
    const content = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: apiImage } },
    ];
    const body = {
      model: requestModel,
      stream: false,
      messages: [{ role: 'user', content }],
      modalities: ['text', 'image'],
      n: 1,
      size: dimensions ? `${dimensions.width}x${dimensions.height}` : 'auto',
      aspect_ratio: dimensions ? reduceRatio(dimensions.width, dimensions.height) : 'auto',
    };
    const endpoint = buildPlatformEndpoint(platform, '/chat/completions');
    onRequest?.(endpoint);
    const json = await fetchJson(endpoint, body, platform.apiKey, 600000);
    return extractFirstReturnedImage(json, [firstImage]);
  };

  const runImagesEditUpscale = async () => {
    const formData = new FormData();
    formData.append('model', requestModel);
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', dimensions ? clampImageSizeToMaxEdge(dimensions.width, dimensions.height, 3840) : 'auto');
    formData.append('quality', 'high');
    const file = await imageSourceToFile(apiImage, 0);
    formData.append('image', file);
    const endpoint = buildPlatformEndpoint(platform, '/images/edits');
    onRequest?.(endpoint);
    const json = await fetchFormJson(endpoint, formData, platform.apiKey, 600000);
    return extractFirstReturnedImage(json, [firstImage]);
  };

  if (supportsChatImageGeneration(requestModel)) return [await runChatUpscale()];
  if (supportsImagesApiGeneration(requestModel)) return [await runImagesEditUpscale()];
  throw new Error(`当前模型 ${selectedModel} 没有可用的高清放大路由。`);
}

async function reversePromptWithApi({ settings, nodeData, upstreamImages }) {
  const platform = validateApi(settings, nodeData.platformId);
  const firstImage = uniqueImages(upstreamImages || [])[0];
  if (!firstImage) throw new Error('反推提示词节点需要先连接一个图片节点。');
  const model = nodeData.model || settings.defaultTextModel;
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `请观察这张图片，反推出适合 AI 绘图的中文详细提示词，必须用中文输出。\n\n输出格式固定为：\n【简略总览】\n用 1-2 句话概括图片主体、场景和整体风格。\n\n【详细提示词】\n主体与场景：详细描述画面主体、环境、道具和关键元素。\n构图与镜头：描述视角、景别、画幅比例、主体位置、透视关系、焦段/景深。\n光影与色彩：描述光源方向、明暗关系、氛围、色调、饱和度、对比度。\n材质与细节：描述产品/服装/皮肤/金属/玻璃/水珠/纹理等可见材质。\n人物与动作：如果有人物，描述年龄气质、姿势、手部动作、表情、穿搭；没有人物则写“无人物”。\n风格与质感：描述商业摄影、海报、写实渲染、时尚大片等风格关键词。\n负面限制：列出不要变形、不要多余文字、不要错误结构、不要低清晰度等限制。\n\n要求：不要只给短句，要像可直接复制到生图节点的完整提示词。`,
          },
          { type: 'image_url', image_url: { url: firstImage } },
        ],
      },
    ],
  };
  const json = await fetchJson(buildPlatformEndpoint(platform, '/chat/completions'), body, platform.apiKey);
  const text =
    json?.choices?.[0]?.message?.content ||
    json?.choices?.[0]?.delta?.content ||
    findTextDeep(json?.choices?.[0]?.message) ||
    findTextDeep(json);
  if (!text.trim()) throw new Error('接口已返回，但没有解析到中文提示词。');
  return text.trim();
}

function splitModelLabel(value = '') {
  const text = String(value || '选择模型');
  if (text.includes('-preview-')) {
    const [first, rest] = text.split('-preview-');
    return [first, `preview-${rest}`];
  }
  if (text.length > 28 && text.includes('-')) {
    const parts = text.split('-');
    const first = [];
    const second = [];
    let firstLen = 0;
    parts.forEach((part, index) => {
      const target = firstLen < text.length / 2 || !first.length ? first : second;
      target.push(part);
      if (target === first) firstLen += part.length + (index ? 1 : 0);
    });
    return [first.join('-'), second.join('-')].filter(Boolean);
  }
  return [text];
}

function ModelLabel({ value }) {
  return (
    <span className="model-label-lines">
      {splitModelLabel(value).map((line) => <span key={line}>{line}</span>)}
    </span>
  );
}

function IconBadge({ icon: Icon, text, title, onClick, className = '', active = false, children }) {
  const safeTitle = title || (typeof text === 'string' ? text : '');
  return (
    <button className={`icon-badge ${active ? 'active' : ''} ${className}`} title={safeTitle} onClick={onClick} type="button">
      {Icon ? <Icon size={13} /> : null}
      <span className="badge-text">{children || text}</span>
    </button>
  );
}

function RatioOption({ ratio }) {
  const className = `ratio-visual ratio-${String(ratio).replace(':', '-')}`;
  return (
    <span className="ratio-option-inner">
      {ratio === '自适应' ? <span className="ratio-visual ratio-auto">□</span> : <span className={className} />}
      <span>{ratio}</span>
    </span>
  );
}

function ChoicePopover({ type, options, value, onPick, onClose }) {
  const popoverClass = [
    'option-popover',
    type === 'model' ? 'option-popover-model' : '',
    type === 'ratio' ? 'option-popover-ratio' : '',
    type === 'count' ? 'option-popover-count' : '',
    type === 'quality' ? 'option-popover-quality' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`${popoverClass} nodrag nopan`}>
      {options.map((rawOption) => {
        const option = typeof rawOption === 'object' ? rawOption.value : rawOption;
        const label = typeof rawOption === 'object' ? rawOption.label : rawOption;
        const normalized = String(option);
        const active = normalized === String(value);
        return (
          <button
            key={option}
            type="button"
            className={active ? 'active' : ''}
            onClick={(event) => {
              event.stopPropagation();
              onPick(option);
              onClose?.();
            }}
          >
            {type === 'model' ? (
              <ModelLabel value={String(label)} />
            ) : type === 'ratio' ? (
              <RatioOption ratio={String(label)} />
            ) : (
              <span>{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}


function stopCanvasDrag(event) {
  event.stopPropagation();
}

function NodeShell({ children, title, icon: Icon, status, selected, className = '' }) {
  return (
    <div className={`node-shell ${selected ? 'selected' : ''} ${className}`}>
      <div className="node-header">
        <div className="node-title">
          {Icon ? <Icon size={14} /> : null}
          <span>{title}</span>
        </div>
        <span className="node-status">{status || '就绪'}</span>
      </div>
      {children}
    </div>
  );
}

function ImageNode({ id, data, selected }) {
  const inputRef = useRef(null);
  const setImage = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      data.addLog?.('失败：请选择图片文件。', 'error');
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      data.updateNode?.(id, {
        image: url,
        fileName: file.name,
        status: '已上传',
      });
    } catch (error) {
      data.addLog?.(`上传失败：${error.message}`, 'error');
    }
  };
  return (
    <NodeShell title={data.title || '图片节点'} icon={ImageIcon} status={data.status} selected={selected} className="image-node">
      <Handle type="target" position={Position.Left} className="handle target" />
      <div className="image-frame">
        {data.image ? (
          <button className="image-preview-button" type="button" onClick={() => data.openImagePreview?.(data.image, data.fileName || '图片')}>
            <img src={data.image} alt={data.fileName || '图片'} draggable={false} />
          </button>
        ) : (
          <button className="upload-empty" type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={18} />
            <span>上传图片</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => setImage(event.target.files)}
      />
      <div className={`node-actions image-node-actions ${data.image ? 'has-image' : 'only-upload'}`}>
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={13} /> 上传
        </button>
        {data.image ? (
          <>
            <button type="button" onClick={() => data.openImagePreview?.(data.image, data.fileName || '图片')}>
              <Eye size={13} /> 放大
            </button>
            <button type="button" onClick={() => data.downloadImage?.(data.image, data.fileName || '图片.png')}>
              <Download size={13} /> 下载
            </button>
          </>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} className="handle source plus-handle">
        <Plus size={12} />
      </Handle>
    </NodeShell>
  );
}

function TextNode({ id, data, selected }) {
  return (
    <NodeShell title={data.title || '文本'} icon={Clipboard} status={data.status} selected={selected}>
      <Handle type="target" position={Position.Left} className="handle target" />
      <textarea
        className="node-textarea nodrag nopan nowheel"
        value={data.text || ''}
        placeholder="输入提示词，可连接到图片生成节点"
        onPointerDown={stopCanvasDrag}
        onMouseDown={stopCanvasDrag}
        onDoubleClick={stopCanvasDrag}
        onChange={(event) => data.updateNode?.(id, { text: event.target.value })}
      />
      <Handle type="source" position={Position.Right} className="handle source plus-handle">
        <Plus size={12} />
      </Handle>
    </NodeShell>
  );
}

function NodeApiSelect({ settings, value, onChange }) {
  const platforms = settings?.platforms?.length ? settings.platforms : DEFAULT_PLATFORMS;
  const selected = value || settings?.activePlatformId || platforms[0]?.id;
  return (
    <label className="node-api-select-row">
      <span>API</span>
      <select
        value={selected}
        onChange={(event) => onChange?.(event.target.value)}
        onPointerDown={stopCanvasDrag}
        onMouseDown={stopCanvasDrag}
      >
        {platforms.map((platform) => (
          <option key={platform.id} value={platform.id}>{getPlatformLabel(platform)}</option>
        ))}
      </select>
    </label>
  );
}

function GenerateNode({ id, data, selected }) {
  const [openMenu, setOpenMenu] = useState(null);
  const toggleMenu = (name) => setOpenMenu((current) => (current === name ? null : name));
  const settings = data.settings || DEFAULT_SETTINGS;
  const platform = getPlatformById(settings, data.platformId);
  const modelOptions = getImageModelOptions(platform, data.model || settings.defaultImageModel);
  const choosePlatform = (platformId) => {
    const nextPlatform = getPlatformById(settings, platformId);
    const nextOptions = getImageModelOptions(nextPlatform);
    data.updateNode?.(id, {
      platformId,
      model: nextOptions.includes(data.model) ? data.model : nextOptions[0],
    });
  };

  return (
    <NodeShell title={data.title || '图片生成'} icon={Sparkles} status={data.status} selected={selected} className="generate-node">
      <Handle type="target" position={Position.Left} className="handle target" />
      <div className="preview-row">
        {(data.upstreamImages || []).map((image, index) => (
          <img key={`${image}-${index}`} src={image} alt="上游缩略图" draggable={false} />
        ))}
        {!(data.upstreamImages || []).length ? <span className="empty-preview">可连接上游图片作为参考</span> : null}
      </div>
      <textarea
        className="node-textarea prompt nodrag nopan nowheel"
        value={data.prompt || ''}
        placeholder="输入生图提示词，也可以连接文本节点"
        onPointerDown={stopCanvasDrag}
        onMouseDown={stopCanvasDrag}
        onDoubleClick={stopCanvasDrag}
        onChange={(event) => data.updateNode?.(id, { prompt: event.target.value })}
      />
      <div className="node-option-wrap nodrag nopan">
        <NodeApiSelect settings={settings} value={data.platformId || settings.activePlatformId} onChange={choosePlatform} />
        <div className="generate-model-row">
          <IconBadge
            icon={Wand2}
            className="model-badge full"
            text={data.model || '选择模型'}
            title="模型"
            active={openMenu === 'model'}
            onClick={() => toggleMenu('model')}
          >
            <ModelLabel value={data.model || '选择模型'} />
          </IconBadge>
        </div>
        <div className="generate-control-row">
          <IconBadge icon={Eye} text={data.quality || '1k'} title="画质" active={openMenu === 'quality'} onClick={() => toggleMenu('quality')} />
          <IconBadge icon={Crosshair} text={data.ratio || '1:1'} title="尺寸" active={openMenu === 'ratio'} onClick={() => toggleMenu('ratio')} />
          <IconBadge icon={Copy} text={`${data.count || 1}张`} title="生成张数" active={openMenu === 'count'} onClick={() => toggleMenu('count')} />
          <button type="button" className="run-pill" onClick={() => data.runNode?.(id)} disabled={data.running}>
            {data.running ? <Loader2 size={13} className="spin" /> : <Play size={13} />} 运行
          </button>
        </div>
        {openMenu === 'model' ? (
          <ChoicePopover
            type="model"
            options={modelOptions}
            value={data.model || settings.defaultImageModel}
            onPick={(model) => data.updateNode?.(id, { model })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
        {openMenu === 'ratio' ? (
          <ChoicePopover
            type="ratio"
            options={[...RATIOS, '自适应']}
            value={data.ratio || '1:1'}
            onPick={(ratio) => data.updateNode?.(id, { ratio })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
        {openMenu === 'count' ? (
          <ChoicePopover
            type="count"
            options={COUNTS.map((count) => `${count}张`)}
            value={`${data.count || 1}张`}
            onPick={(countLabel) => data.updateNode?.(id, { count: Number(String(countLabel).replace('张', '')) })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
        {openMenu === 'quality' ? (
          <ChoicePopover
            type="quality"
            options={['1k', '2k', '3k', '4k']}
            value={data.quality || '1k'}
            onPick={(quality) => data.updateNode?.(id, { quality })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} className="handle source plus-handle">
        <Plus size={12} />
      </Handle>
    </NodeShell>
  );
}

function UpscaleNode({ id, data, selected }) {
  const [openMenu, setOpenMenu] = useState(null);
  const settings = data.settings || DEFAULT_SETTINGS;
  const platform = getPlatformById(settings, data.platformId);
  const modelOptions = getImageModelOptions(platform, data.model || UPSCALE_DEFAULT_MODEL);
  const choosePlatform = (platformId) => {
    const nextPlatform = getPlatformById(settings, platformId);
    const nextOptions = getImageModelOptions(nextPlatform);
    data.updateNode?.(id, {
      platformId,
      model: nextOptions.includes(data.model) ? data.model : UPSCALE_DEFAULT_MODEL,
    });
  };

  return (
    <NodeShell title={data.title || '高清放大'} icon={Sparkles} status={data.status} selected={selected} className="upscale-node">
      <Handle type="target" position={Position.Left} className="handle target" />
      <div className="preview-row">
        {(data.upstreamImages || []).map((image, index) => (
          <img key={`${image}-${index}`} src={image} alt="待高清放大图片" draggable={false} />
        ))}
        {!(data.upstreamImages || []).length ? <span className="empty-preview">连接图片后可高清增强，输出保持原图尺寸</span> : null}
      </div>
      <textarea
        className="node-textarea prompt nodrag nopan nowheel"
        value={data.prompt || ''}
        placeholder="可选：输入高清增强要求；留空会自动提升清晰度、材质和边缘细节，并保持原图尺寸不变"
        onPointerDown={stopCanvasDrag}
        onMouseDown={stopCanvasDrag}
        onDoubleClick={stopCanvasDrag}
        onChange={(event) => data.updateNode?.(id, { prompt: event.target.value })}
      />
      <div className="node-option-wrap reverse-option-wrap nodrag nopan">
        <NodeApiSelect settings={settings} value={data.platformId || settings.activePlatformId} onChange={choosePlatform} />
        <div className="generate-model-row">
          <IconBadge
            icon={Wand2}
            className="model-badge full"
            text={data.model || UPSCALE_DEFAULT_MODEL}
            title="高清放大模型"
            active={openMenu === 'model'}
            onClick={() => setOpenMenu((current) => current === 'model' ? null : 'model')}
          >
            <ModelLabel value={data.model || UPSCALE_DEFAULT_MODEL} />
          </IconBadge>
        </div>
        {openMenu === 'model' ? (
          <ChoicePopover
            type="model"
            options={modelOptions}
            value={data.model || UPSCALE_DEFAULT_MODEL}
            onPick={(model) => data.updateNode?.(id, { model })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
      </div>
      <div className="node-actions right reverse-node-actions">
        <button type="button" className="primary small" onClick={() => data.runNode?.(id)} disabled={data.running}>
          {data.running ? <Loader2 size={13} className="spin" /> : <Play size={13} />} 运行
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="handle source plus-handle">
        <Plus size={12} />
      </Handle>
    </NodeShell>
  );
}

function ReverseNode({ id, data, selected }) {
  const [openMenu, setOpenMenu] = useState(null);
  const settings = data.settings || DEFAULT_SETTINGS;
  const platform = getPlatformById(settings, data.platformId);
  const modelOptions = getTextModelOptions(platform, data.model || settings.defaultTextModel);
  const choosePlatform = (platformId) => {
    const nextPlatform = getPlatformById(settings, platformId);
    const nextOptions = getTextModelOptions(nextPlatform);
    data.updateNode?.(id, {
      platformId,
      model: nextOptions.includes(data.model) ? data.model : settings.defaultTextModel,
    });
  };
  return (
    <NodeShell title={data.title || '反推提示词'} icon={Wand2} status={data.status} selected={selected} className="reverse-node">
      <Handle type="target" position={Position.Left} className="handle target" />
      <div className="preview-row">
        {(data.upstreamImages || []).map((image, index) => (
          <img key={`${image}-${index}`} src={image} alt="反推图片" draggable={false} />
        ))}
        {!(data.upstreamImages || []).length ? <span className="empty-preview">连接图片后可反推</span> : null}
      </div>
      <div className="node-option-wrap reverse-option-wrap nodrag nopan">
        <NodeApiSelect settings={settings} value={data.platformId || settings.activePlatformId} onChange={choosePlatform} />
        <div className="generate-model-row">
          <IconBadge
            icon={Wand2}
            className="model-badge full"
            text={data.model || '选择模型'}
            title="反推模型"
            active={openMenu === 'model'}
            onClick={() => setOpenMenu((current) => current === 'model' ? null : 'model')}
          >
            <ModelLabel value={data.model || '选择模型'} />
          </IconBadge>
        </div>
        {openMenu === 'model' ? (
          <ChoicePopover
            type="model"
            options={modelOptions}
            value={data.model || settings.defaultTextModel}
            onPick={(model) => data.updateNode?.(id, { model })}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
      </div>
      <textarea
        className="node-textarea result nodrag nopan nowheel"
        value={data.text || ''}
        placeholder="运行后这里显示中文反推提示词"
        onPointerDown={stopCanvasDrag}
        onMouseDown={stopCanvasDrag}
        onDoubleClick={stopCanvasDrag}
        onChange={(event) => data.updateNode?.(id, { text: event.target.value })}
      />
      <div className="node-actions right reverse-node-actions">
        <button type="button" className="primary small" onClick={() => data.runNode?.(id)}>
          {data.running ? <Loader2 size={13} className="spin" /> : <Play size={13} />} 运行
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="handle source plus-handle">
        <Plus size={12} />
      </Handle>
    </NodeShell>
  );
}

function GroupNode({ id, data, selected }) {
  return (
    <div className={`group-node ${selected ? 'selected' : ''}`} style={{ width: data.width, height: data.height }}>
      <div className="group-title">
        <Boxes size={14} />
        <span>{data.title || '分组'}</span>
        <button type="button" onClick={() => data.runGroup?.(id)}>
          <Play size={12} /> 整组执行
        </button>
      </div>
    </div>
  );
}

function EdgeWithDeleteButton({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, selected }) {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const path = `M ${sourceX},${sourceY} C ${sourceX + 90},${sourceY} ${targetX - 90},${targetY} ${targetX},${targetY}`;
  return (
    <>
      <path id={id} className="react-flow__edge-path custom-edge-path" d={path} markerEnd={markerEnd} style={style} />
      <circle cx={midX} cy={midY} r={selected ? 7 : 5} className={`edge-middle ${selected ? 'selected' : ''}`} />
    </>
  );
}

function LeftPanel({ logs, progress, addImageNodeFromUpload, runAll, queueRunning }) {
  const inputRef = useRef(null);
  const shownLogs = logs.slice(0, 8);
  return (
    <aside className="run-log-panel nodrag">
      <div className="run-log-head">
        <div>
          <b>运行日志</b>
          <span>任务状态与错误提示</span>
        </div>
        <span className="run-log-progress">{progress}%</span>
      </div>
      <div className="run-log-actions">
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> 上传图片
        </button>
        <button className="primary" type="button" onClick={runAll}>
          {queueRunning ? <Loader2 className="spin" size={14} /> : <Play size={14} />} 运行队列
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => addImageNodeFromUpload(event.target.files)}
        />
      </div>
      <div className="run-log-track"><div style={{ width: `${progress}%` }} /></div>
      <div className="run-log-list">
        {shownLogs.length ? shownLogs.map((log) => (
          <div className={`log-item ${log.type}`} key={log.id}>
            {log.type === 'error' ? <XCircle size={14} /> : log.type === 'success' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
            <span>{log.text}</span>
          </div>
        )) : <div className="log-empty">暂无运行日志。运行节点后会显示在这里。</div>}
      </div>
    </aside>
  );
}

function TopToolbar({ onSettings, onRunAll, onGroup, onUngroup, onAlign, onDistribute, onAutoLayout, onFit, queueRunning }) {
  return (
    <div className="top-toolbar">
      <button type="button" onClick={onFit}><Crosshair size={15} /> 适配视图</button>
      <button type="button" onClick={() => onAlign('left')}><AlignLeft size={15} /> 左对齐</button>
      <button type="button" onClick={() => onAlign('top')}><AlignStartHorizontal size={15} /> 顶对齐</button>
      <button type="button" onClick={() => onDistribute('horizontal')}><Columns3 size={15} /> 水平分布</button>
      <button type="button" onClick={() => onDistribute('vertical')}><Rows3 size={15} /> 垂直分布</button>
      <button type="button" onClick={onAutoLayout}><Grid2X2 size={15} /> 自动排版</button>
      <button type="button" onClick={onGroup}><Boxes size={15} /> 打组</button>
      <button type="button" onClick={onUngroup}><Ungroup size={15} /> 解组</button>
      <button type="button" className="primary" onClick={onRunAll}>
        {queueRunning ? <Loader2 className="spin" size={15} /> : <Play size={15} />} 全部运行
      </button>
      <button type="button" className="settings-button" onClick={onSettings}><Settings size={15} /> API 设置</button>
    </div>
  );
}

function ContextMenu({ menu, onPick, onClose }) {
  if (!menu) return null;
  return (
    <div className="context-menu" style={{ left: menu.screen.x, top: menu.screen.y }}>
      <div className="context-title">选择节点类型</div>
      <button type="button" onClick={() => onPick('imageNode')}><ImageIcon size={15} /> 图片节点</button>
      <button type="button" onClick={() => onPick('generateNode')}><Sparkles size={15} /> 图片生成节点</button>
      <button type="button" onClick={() => onPick('upscaleNode')}><Sparkles size={15} /> 高清放大节点</button>
      <button type="button" onClick={() => onPick('reverseNode')}><Wand2 size={15} /> 反推提示词节点</button>
      <button type="button" onClick={() => onPick('textNode')}><Clipboard size={15} /> 文本节点</button>
      <button type="button" className="ghost" onClick={onClose}>取消</button>
    </div>
  );
}

function ImagePreview({ preview, onClose }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1.35);
  const dragRef = useRef(null);
  useEffect(() => {
    if (!preview) {
      setOffset({ x: 0, y: 0 });
      setScale(1.35);
    }
  }, [preview]);
  if (!preview) return null;

  const startDrag = (event) => {
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    const move = (moveEvent) => {
      if (!dragRef.current) return;
      setOffset({
        x: dragRef.current.originX + moveEvent.clientX - dragRef.current.startX,
        y: dragRef.current.originY + moveEvent.clientY - dragRef.current.startY,
      });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="image-preview-overlay" onMouseDown={onClose}>
      <div className="image-preview-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="image-preview-head">
          <span>{preview.name || '图片预览'}</span>
          <div>
            <button type="button" onClick={() => setScale((v) => Math.max(0.6, Number((v - 0.25).toFixed(2))))}>缩小</button>
            <button type="button" onClick={() => setScale((v) => Math.min(4, Number((v + 0.25).toFixed(2))))}>放大</button>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="image-preview-stage" onWheel={(event) => {
          event.preventDefault();
          setScale((v) => Math.min(4, Math.max(0.6, Number((v + (event.deltaY < 0 ? 0.12 : -0.12)).toFixed(2)))));
        }}>
          <img
            src={preview.image}
            alt={preview.name || '图片预览'}
            draggable={false}
            onMouseDown={startDrag}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ open, onClose, settings, setSettings, addLog }) {
  const [testStatus, setTestStatus] = useState('');
  const active = getActivePlatform(settings);
  if (!open) return null;

  const updateActive = (patch) => {
    const next = {
      ...settings,
      platforms: settings.platforms.map((item) => (item.id === active.id ? { ...item, ...patch } : item)),
    };
    setSettings(next);
  };

  const addPlatform = () => {
    const id = uid('platform');
    setSettings({
      ...settings,
      activePlatformId: id,
      platforms: [
        ...settings.platforms,
        { id, name: `API 平台 ${settings.platforms.length + 1}`, baseUrl: '', apiKey: '' },
      ],
    });
  };

  const removePlatform = () => {
    if (settings.platforms.length <= 1) return;
    const left = settings.platforms.filter((item) => item.id !== active.id);
    setSettings({ ...settings, platforms: left, activePlatformId: left[0].id });
  };

  const testConnection = async () => {
    try {
      setTestStatus('正在测试连接...');
      if (!active.baseUrl || !active.apiKey) throw new Error('请先填写 API 地址和密钥。');
      const url = buildPlatformEndpoint(active, '/models');
      const res = await apiFetch(url, { method: 'GET', headers: headers(active.apiKey) }, 30000);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setTestStatus('连接成功，可以开始运行节点。');
      addLog('API 连接成功。', 'success');
    } catch (error) {
      const msg = `连接失败：${error.message}。请检查 API 地址是否填到 /v1，密钥是否正确，或上游是否支持 OpenAI 兼容接口。`;
      setTestStatus(msg);
      addLog(msg, 'error');
    }
  };

  const queryQuota = async () => {
    try {
      setTestStatus('正在查询额度...');
      if (!active.baseUrl || !active.apiKey) throw new Error('请先填写 API 地址和密钥。');
      const base = normalizeBaseUrl(active.baseUrl).replace(/\/v1$/, '');
      const candidates = [
        buildPlatformEndpoint(active, '/dashboard/billing/credit_grants'),
        buildPlatformEndpoint(active, '/usage'),
        `${base}/dashboard/billing/credit_grants`,
        `${normalizeBaseUrl(active.baseUrl)}/dashboard/billing/credit_grants`,
        `${normalizeBaseUrl(active.baseUrl)}/usage`,
      ];
      let lastError = '';
      for (const url of candidates) {
        try {
          const res = await apiFetch(url, { method: 'GET', headers: headers(active.apiKey) }, 30000);
          const text = await res.text();
          if (res.ok) {
            setTestStatus(`额度接口返回：${text.slice(0, 300) || '空内容'}`);
            return;
          }
          lastError = text || `HTTP ${res.status}`;
        } catch (error) {
          lastError = error.message;
        }
      }
      throw new Error(lastError || '当前平台不支持额度查询接口。');
    } catch (error) {
      setTestStatus(`额度查询失败：${error.message}`);
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <div>
            <b>API 设置</b>
            <span>纯前端，本页填写的信息只保存在你的浏览器 localStorage。</span>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="settings-grid">
          <div className="platform-list">
            <div className="side-title">API 地址</div>
            {settings.platforms.map((item) => (
              <button
                key={item.id}
                className={item.id === settings.activePlatformId ? 'active' : ''}
                type="button"
                onClick={() => setSettings({ ...settings, activePlatformId: item.id })}
              >
                <LinkIcon size={14} /> {item.name || '未命名平台'}
              </button>
            ))}
            <button type="button" className="add-platform" onClick={addPlatform}><Plus size={14} /> 添加平台</button>
          </div>
          <div className="settings-form">
            <label>
              平台名称
              <input value={active.name || ''} onChange={(event) => updateActive({ name: event.target.value })} />
            </label>
            <label>
              总 API 地址
              <input
                value={active.baseUrl || ''}
                placeholder="例如：https://你的中转平台/v1"
                onChange={(event) => updateActive({ baseUrl: event.target.value })}
              />
            </label>
            <label>
              API 密钥
              <input
                value={active.apiKey || ''}
                type="password"
                placeholder="sk-..."
                onChange={(event) => updateActive({ apiKey: event.target.value })}
              />
            </label>
            <div className="two-cols">
              <label>
                默认文本 / 反推模型
                <select
                  value={settings.defaultTextModel}
                  onChange={(event) => setSettings({ ...settings, defaultTextModel: event.target.value })}
                >
                  {TEXT_MODEL_OPTIONS.map((model) => <option key={model}>{model}</option>)}
                </select>
              </label>
              <label>
                默认生图模型
                <select
                  value={settings.defaultImageModel}
                  onChange={(event) => setSettings({ ...settings, defaultImageModel: event.target.value })}
                >
                  {IMAGE_MODEL_OPTIONS.map((model) => <option key={model}>{model}</option>)}
                </select>
              </label>
            </div>
            <div className="settings-actions">
              <button type="button" className="primary" onClick={testConnection}><KeyRound size={15} /> 测试 API 链接</button>
              <button type="button" onClick={queryQuota}><Eye size={15} /> 查询额度</button>
              <button type="button" className="danger" onClick={removePlatform}><Trash2 size={15} /> 删除平台</button>
            </div>
            {testStatus ? <div className="test-status">{testStatus}</div> : null}
            <div className="notice-box">
              <b>怎么填：</b>API 地址通常填到 <code>/v1</code> 结尾，例如 <code>https://你的中转平台/v1</code>。只保留空白地址，你可以自己添加或删除；API 密钥只保存在你的浏览器 localStorage。当前版本路由规则：<code>gpt-image-2</code> 无参考图走 <code>/v1/images/generations</code>，有参考图走 <code>/v1/images/edits</code>；界面里的 <code>gpt-image-2-4k</code> 会兼容转成 <code>gpt-image-2</code> 请求，并通过 3k/4k 尺寸控制清晰度；<code>gemini-3.1-flash-image</code> 走 <code>/v1/chat/completions</code>。高清放大节点默认用 <code>gemini-3.1-flash-image</code>，会尽量保持原图尺寸与构图不变。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const reactFlow = useReactFlow();
  const [settings, setSettingsState] = useState(loadSettings);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [menu, setMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const connectStartRef = useRef(null);
  const connectionMadeRef = useRef(false);
  const flowWrapperRef = useRef(null);
  const clipboardRef = useRef({ nodes: [], edges: [] });
  const [imagePreview, setImagePreview] = useState(null);

  const setSettings = useCallback((next) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const addLog = useCallback((text, type = 'info') => {
    setLogs((prev) => [{ id: uid('log'), text, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 80));
  }, []);

  const updateNode = useCallback((nodeId, patch) => {
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)));
  }, [setNodes]);

  const downloadImage = useCallback(async (imageUrl, name = '图片.png') => {
    try {
      const safeName = (name || '图片.png').replace(/[\\/:*?"<>|]/g, '-');
      const fileName = /\.(png|jpe?g|webp|gif)$/i.test(safeName) ? safeName : `${safeName}.png`;
      let href = imageUrl;
      let objectUrl = '';
      try {
        if (!isDataImage(imageUrl)) {
          const response = await fetch(imageUrl, { mode: 'cors' });
          if (response.ok) {
            objectUrl = URL.createObjectURL(await response.blob());
            href = objectUrl;
          }
        }
      } catch {
        // 跨域图片无法读取时，仍然使用浏览器的 download 下载方式，不打开新窗口。
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      addLog('图片已开始下载到本地。', 'success');
    } catch (error) {
      addLog(`下载失败：${error.message}`, 'error');
    }
  }, [addLog]);

  const openImagePreview = useCallback((image, name = '图片预览') => {
    if (!image) return;
    setImagePreview({ image, name });
  }, []);

  const withCommonData = useCallback((node) => ({
    ...node,
    data: {
      ...node.data,
      updateNode,
      runNode: (id) => runNodeRef.current?.(id),
      runGroup: (id) => runGroupRef.current?.(id),
      downloadImage,
      openImagePreview,
      addLog,
      settings,
    },
  }), [updateNode, downloadImage, openImagePreview, addLog, settings]);

  const addNode = useCallback((type, position, extra = {}) => {
    const id = uid(type);
    const base = { id, type, position, selected: true };
    const defaults = {
      imageNode: { title: '图片节点', image: extra.image || '', fileName: extra.fileName || '', status: extra.image ? '已导入' : '等待上传' },
      generateNode: {
        title: '图片生成',
        prompt: '',
        platformId: settings.activePlatformId,
        model: settings.defaultImageModel,
        ratio: '1:1',
        quality: '1k',
        count: 1,
        upstreamImages: [],
        status: '等待运行',
      },
      upscaleNode: {
        title: '高清放大',
        platformId: settings.activePlatformId,
        model: UPSCALE_DEFAULT_MODEL,
        prompt: '',
        upstreamImages: [],
        status: '等待运行',
      },
      reverseNode: {
        title: '反推提示词',
        platformId: settings.activePlatformId,
        model: settings.defaultTextModel,
        text: '',
        upstreamImages: [],
        status: '等待运行',
      },
      textNode: { title: '文本', text: '', status: '可编辑' },
    };
    const newNode = withCommonData({ ...base, data: { ...(defaults[type] || defaults.textNode), ...extra } });
    setNodes((prev) => prev.map((node) => ({ ...node, selected: false })).concat(newNode));
    if (menu?.sourceNodeId) {
      setEdges((prev) =>
        addEdge(
          {
            id: uid('edge'),
            source: menu.sourceNodeId,
            target: id,
            type: 'customEdge',
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            style: { strokeWidth: 2 },
          },
          prev,
        ),
      );
    }
    setMenu(null);
    return id;
  }, [menu, setEdges, setNodes, settings.activePlatformId, settings.defaultImageModel, settings.defaultTextModel, withCommonData]);

  const getUpstream = useCallback((nodeId, currentNodes = reactFlow.getNodes(), currentEdges = reactFlow.getEdges()) => {
    const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
    const images = [];
    const texts = [];
    const visited = new Set();

    const collectFrom = (targetId) => {
      if (visited.has(targetId)) return;
      visited.add(targetId);
      const incomingEdges = currentEdges.filter((edge) => edge.target === targetId);
      incomingEdges.forEach((edge) => {
        const source = nodeById.get(edge.source);
        if (!source) return;
        if (source.type === 'imageNode' && source.data.image) {
          images.push(source.data.image);
          return;
        }
        if ((source.type === 'generateNode' || source.type === 'upscaleNode') && source.data.outputImages?.length) {
          images.push(...source.data.outputImages);
          return;
        }
        if (source.type === 'reverseNode' && source.data.text) texts.push(source.data.text);
        if (source.type === 'textNode' && source.data.text) texts.push(source.data.text);
        collectFrom(source.id);
      });
    };

    collectFrom(nodeId);
    return { images: uniqueImages(images), text: texts.filter(Boolean).join('\n') };
  }, [reactFlow]);

  useEffect(() => {
    setNodes((prevNodes) => {
      let changed = false;
      const nextNodes = prevNodes.map((node) => {
        if (!['generateNode', 'upscaleNode', 'reverseNode'].includes(node.type)) return node;
        const { images } = getUpstream(node.id, prevNodes, edges);
        if (sameStringList(images, node.data.upstreamImages || [])) return node;
        changed = true;
        return { ...node, data: { ...node.data, upstreamImages: images } };
      });
      return changed ? nextNodes : prevNodes;
    });
  }, [nodes, edges, getUpstream, setNodes]);

  const createResultImageNodes = useCallback((sourceNode, images) => {
    const baseX = sourceNode.position.x + 360;
    const baseY = sourceNode.position.y;
    const newNodes = images.map((image, index) => withCommonData({
      id: uid('result-image'),
      type: 'imageNode',
      position: { x: baseX + (index % 2) * 220, y: baseY + Math.floor(index / 2) * 260 },
      data: {
        title: `结果图片 ${index + 1}`,
        image,
        fileName: `生成图片-${Date.now()}-${index + 1}.png`,
        status: '生成成功',
      },
    }));
    const newEdges = newNodes.map((target) => ({
      id: uid('edge'),
      source: sourceNode.id,
      target: target.id,
      type: 'customEdge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { strokeWidth: 2 },
    }));
    setNodes((prev) => prev.concat(newNodes));
    setEdges((prev) => prev.concat(newEdges));
  }, [setEdges, setNodes, withCommonData]);

  const runningNodeIdsRef = useRef(new Set());

  const runNode = useCallback(async (nodeId) => {
    const snapshotNodes = reactFlow.getNodes();
    const snapshotEdges = reactFlow.getEdges();
    const node = snapshotNodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (runningNodeIdsRef.current.has(nodeId) || node.data?.running) {
      addLog('这个节点正在运行中，已忽略重复触发。', 'info');
      return;
    }
    runningNodeIdsRef.current.add(nodeId);
    try {
      if (!['generateNode', 'upscaleNode', 'reverseNode'].includes(node.type)) {
        addLog('这个节点不需要运行。', 'info');
        return;
      }
      updateNode(nodeId, { running: true, status: '运行中...' });
      addLog(`开始运行：${node.data.title || node.type}`, 'info');
      const upstream = getUpstream(nodeId, snapshotNodes, snapshotEdges);
      if (node.type === 'generateNode' || node.type === 'upscaleNode') {
        const platform = getPlatformById(settings, node.data.platformId);
        const fallbackModel = node.type === 'upscaleNode' ? UPSCALE_DEFAULT_MODEL : settings.defaultImageModel;
        addLog(`使用 API：${getPlatformLabel(platform)}；模型：${node.data.model || fallbackModel}；上游参考图：${upstream.images.length} 张。`, 'info');
      }
      if (node.type === 'generateNode') {
        let actualRequestCount = 0;
        const images = await generateImagesWithApi({
          settings,
          nodeData: node.data,
          upstreamText: upstream.text,
          upstreamImages: upstream.images,
          onRequest: (endpoint) => {
            actualRequestCount += 1;
            addLog(`实际请求 ${actualRequestCount}：${endpoint}`, 'info');
          },
        });
        updateNode(nodeId, { running: false, status: '生成成功', outputImages: images });
        createResultImageNodes(node, images);
        addLog(`生成成功：得到 ${images.length} 张图片；前端实际发送 ${actualRequestCount} 次请求。`, actualRequestCount === 1 ? 'success' : 'warn');
      }
      if (node.type === 'upscaleNode') {
        let actualRequestCount = 0;
        const images = await upscaleImageWithApi({
          settings,
          nodeData: node.data,
          upstreamImages: upstream.images,
          onRequest: (endpoint) => {
            actualRequestCount += 1;
            addLog(`实际请求 ${actualRequestCount}：${endpoint}`, 'info');
          },
        });
        updateNode(nodeId, { running: false, status: '高清完成', outputImages: images });
        createResultImageNodes(node, images);
        addLog(`高清放大完成：得到 ${images.length} 张图片；前端实际发送 ${actualRequestCount} 次请求。`, actualRequestCount === 1 ? 'success' : 'warn');
      }
      if (node.type === 'reverseNode') {
        const text = await reversePromptWithApi({ settings, nodeData: node.data, upstreamImages: upstream.images });
        updateNode(nodeId, { running: false, status: '反推成功', text });
        addLog('反推提示词成功。', 'success');
      }
    } catch (error) {
      const msg = error?.message || String(error);
      updateNode(nodeId, { running: false, status: '失败' });
      addLog(`运行失败：${msg}`, 'error');
    } finally {
      runningNodeIdsRef.current.delete(nodeId);
      updateNode(nodeId, { running: false });
    }
  }, [reactFlow, addLog, updateNode, getUpstream, settings, createResultImageNodes]);

  const runNodeRef = useRef(runNode);
  useEffect(() => { runNodeRef.current = runNode; }, [runNode]);

  const runAll = useCallback(async () => {
    if (queueRunning) return;
    setQueueRunning(true);
    const runnable = reactFlow.getNodes().filter((node) => ['reverseNode', 'generateNode', 'upscaleNode'].includes(node.type));
    if (!runnable.length) addLog('画布里还没有可运行的节点。', 'info');
    for (const node of runnable) {
      // eslint-disable-next-line no-await-in-loop
      await runNodeRef.current(node.id);
    }
    setQueueRunning(false);
  }, [queueRunning, reactFlow, addLog]);

  const runGroup = useCallback(async (groupId) => {
    const groupChildren = reactFlow.getNodes().filter((node) => node.parentId === groupId && ['reverseNode', 'generateNode', 'upscaleNode'].includes(node.type));
    if (!groupChildren.length) {
      addLog('这个分组里没有可运行的图片生成或反推节点。', 'info');
      return;
    }
    for (const node of groupChildren) {
      // eslint-disable-next-line no-await-in-loop
      await runNodeRef.current(node.id);
    }
  }, [reactFlow, addLog]);

  const runGroupRef = useRef(runGroup);
  useEffect(() => { runGroupRef.current = runGroup; }, [runGroup]);

  const onConnect = useCallback((connection) => {
    connectionMadeRef.current = true;
    setEdges((prev) => addEdge({
      ...connection,
      id: uid('edge'),
      type: 'customEdge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { strokeWidth: 2 },
    }, prev));
  }, [setEdges]);

  const onConnectStart = useCallback((_, params) => {
    connectionMadeRef.current = false;
    connectStartRef.current = params;
  }, []);

  const onConnectEnd = useCallback((event) => {
    const start = connectStartRef.current;
    const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
    const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
    const target = event.target;
    const droppedOnTargetHandle = Boolean(target?.closest?.('.react-flow__handle.target'));
    const droppedOnNode = Boolean(target?.closest?.('.react-flow__node'));

    if (!connectionMadeRef.current && start?.nodeId && start?.handleType === 'source' && !droppedOnTargetHandle) {
      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      const position = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
      setMenu({
        flow: position,
        screen: {
          x: Math.max(12, Math.min((clientX || 0) - (bounds?.left || 0), (bounds?.width || window.innerWidth) - 210)),
          y: Math.max(72, Math.min((clientY || 0) - (bounds?.top || 0), (bounds?.height || window.innerHeight) - 210)),
        },
        sourceNodeId: start.nodeId,
      });
      if (droppedOnNode) addLog('未连接到节点左侧输入口，可在菜单里选择新节点。', 'info');
    }
    connectStartRef.current = null;
    connectionMadeRef.current = false;
  }, [reactFlow, addLog]);

  const openNodeMenuAt = useCallback((event, sourceNodeId = null) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = flowWrapperRef.current?.getBoundingClientRect();
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMenu({
      flow: position,
      screen: {
        x: Math.max(12, Math.min(event.clientX - (bounds?.left || 0), (bounds?.width || window.innerWidth) - 210)),
        y: Math.max(72, Math.min(event.clientY - (bounds?.top || 0), (bounds?.height || window.innerHeight) - 210)),
      },
      sourceNodeId,
    });
  }, [reactFlow]);

  const onPaneDoubleClick = useCallback((event) => {
    openNodeMenuAt(event, null);
  }, [openNodeMenuAt]);

  const onCanvasDoubleClickCapture = useCallback((event) => {
    if (event.target?.closest?.('.react-flow__node, .context-menu, .top-toolbar, .run-log-panel, .react-flow__controls, .react-flow__minimap')) return;
    openNodeMenuAt(event, null);
  }, [openNodeMenuAt]);

  const onDrop = useCallback(async (event) => {
    event.preventDefault();
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length) {
      for (let index = 0; index < files.length; index += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const dataUrl = await fileToDataUrl(files[index]);
          addNode('imageNode', { x: position.x + index * 240, y: position.y + index * 24 }, { image: dataUrl, fileName: files[index].name });
        } catch (error) {
          addLog(`拖拽上传失败：${error.message}`, 'error');
        }
      }
      return;
    }
    const uri = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    if (uri && /^(https?:\/\/|data:image)/.test(uri)) {
      addNode('imageNode', position, { image: uri.trim(), fileName: '外部图片' });
      return;
    }
    addLog('没有识别到图片，请拖入 png、jpg、webp 等图片文件。', 'error');
  }, [reactFlow, addNode, addLog]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const addImageNodeFromUpload = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    for (let index = 0; index < files.length; index += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const dataUrl = await fileToDataUrl(files[index]);
        addNode('imageNode', { x: center.x + index * 240, y: center.y + index * 30 }, { image: dataUrl, fileName: files[index].name });
      } catch (error) {
        addLog(`上传失败：${error.message}`, 'error');
      }
    }
  }, [reactFlow, addNode, addLog]);

  const deleteSelection = useCallback(() => {
    const selectedNodes = reactFlow.getNodes().filter((node) => node.selected).map((node) => node.id);
    const selectedEdges = reactFlow.getEdges().filter((edge) => edge.selected).map((edge) => edge.id);
    if (!selectedNodes.length && !selectedEdges.length) return;
    setNodes((prev) => prev.filter((node) => !selectedNodes.includes(node.id)));
    setEdges((prev) => prev.filter((edge) => !selectedEdges.includes(edge.id) && !selectedNodes.includes(edge.source) && !selectedNodes.includes(edge.target)));
  }, [reactFlow, setEdges, setNodes]);

  const copySelection = useCallback(() => {
    const selected = reactFlow.getNodes().filter((node) => node.selected);
    const selectedIds = new Set(selected.map((node) => node.id));
    const selectedEdges = reactFlow.getEdges().filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));
    clipboardRef.current = { nodes: selected, edges: selectedEdges };
    addLog(`已复制 ${selected.length} 个节点。`, 'success');
  }, [reactFlow, addLog]);

  const pasteSelection = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip.nodes.length) return;
    const idMap = new Map();
    const pastedNodes = clip.nodes.map((node) => {
      const newId = uid('paste');
      idMap.set(node.id, newId);
      return withCommonData({
        ...node,
        id: newId,
        parentId: undefined,
        position: { x: node.position.x + 70, y: node.position.y + 70 },
        selected: true,
        data: { ...node.data, status: node.type === 'imageNode' ? node.data.status : '已粘贴' },
      });
    });
    const pastedEdges = clip.edges.map((edge) => ({
      ...edge,
      id: uid('edge'),
      source: idMap.get(edge.source),
      target: idMap.get(edge.target),
      selected: false,
    })).filter((edge) => edge.source && edge.target);
    setNodes((prev) => prev.map((node) => ({ ...node, selected: false })).concat(pastedNodes));
    setEdges((prev) => prev.concat(pastedEdges));
  }, [setNodes, setEdges, withCommonData]);

  const groupSelected = useCallback(() => {
    const selected = reactFlow.getNodes().filter((node) => node.selected && node.type !== 'groupNode' && !node.parentId);
    if (selected.length < 2) {
      addLog('请先框选至少 2 个节点，再点击打组。', 'error');
      return;
    }
    const minX = Math.min(...selected.map((node) => node.position.x));
    const minY = Math.min(...selected.map((node) => node.position.y));
    const maxX = Math.max(...selected.map((node) => node.position.x + (node.measured?.width || node.width || 260)));
    const maxY = Math.max(...selected.map((node) => node.position.y + (node.measured?.height || node.height || 180)));
    const groupId = uid('group');
    const groupPos = { x: minX - 48, y: minY - 64 };
    const groupNode = withCommonData({
      id: groupId,
      type: 'groupNode',
      position: groupPos,
      selected: true,
      data: { title: '分组节点', width: maxX - minX + 96, height: maxY - minY + 120 },
      style: { width: maxX - minX + 96, height: maxY - minY + 120 },
    });
    const selectedIds = new Set(selected.map((node) => node.id));
    setNodes((prev) => [groupNode, ...prev.map((node) => {
      if (!selectedIds.has(node.id)) return { ...node, selected: false };
      return {
        ...node,
        selected: false,
        parentId: groupId,
        extent: 'parent',
        position: { x: node.position.x - groupPos.x, y: node.position.y - groupPos.y },
      };
    })]);
    addLog('已打组，可拖动分组整体移动，也可点击整组执行。', 'success');
  }, [reactFlow, setNodes, addLog, withCommonData]);

  const ungroupSelected = useCallback(() => {
    const selectedGroups = reactFlow.getNodes().filter((node) => node.selected && node.type === 'groupNode');
    if (!selectedGroups.length) {
      addLog('请先选中分组节点。', 'error');
      return;
    }
    const groupMap = new Map(selectedGroups.map((group) => [group.id, group]));
    setNodes((prev) => prev
      .filter((node) => !groupMap.has(node.id))
      .map((node) => {
        const group = groupMap.get(node.parentId);
        if (!group) return node;
        return {
          ...node,
          parentId: undefined,
          extent: undefined,
          position: { x: node.position.x + group.position.x, y: node.position.y + group.position.y },
        };
      }));
    addLog('已解组。', 'success');
  }, [reactFlow, setNodes, addLog]);

  const alignSelected = useCallback((mode) => {
    const selected = reactFlow.getNodes().filter((node) => node.selected && node.type !== 'groupNode');
    if (selected.length < 2) return;
    const value = mode === 'left' ? Math.min(...selected.map((n) => n.position.x)) : Math.min(...selected.map((n) => n.position.y));
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) => prev.map((node) => {
      if (!ids.has(node.id)) return node;
      return { ...node, position: mode === 'left' ? { ...node.position, x: value } : { ...node.position, y: value } };
    }));
  }, [reactFlow, setNodes]);

  const distributeSelected = useCallback((mode) => {
    const selected = reactFlow.getNodes().filter((node) => node.selected && node.type !== 'groupNode');
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => mode === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const gap = mode === 'horizontal'
      ? (last.position.x - first.position.x) / (sorted.length - 1)
      : (last.position.y - first.position.y) / (sorted.length - 1);
    const posMap = new Map(sorted.map((node, index) => [node.id, mode === 'horizontal'
      ? { ...node.position, x: first.position.x + gap * index }
      : { ...node.position, y: first.position.y + gap * index }]));
    setNodes((prev) => prev.map((node) => posMap.has(node.id) ? { ...node, position: posMap.get(node.id) } : node));
  }, [reactFlow, setNodes]);

  const autoLayout = useCallback(() => {
    const currentNodes = reactFlow.getNodes().filter((node) => node.type !== 'groupNode' && !node.parentId);
    const currentEdges = reactFlow.getEdges();
    const idToNode = new Map(currentNodes.map((node) => [node.id, node]));
    const originalIndex = new Map(currentNodes.map((node, index) => [node.id, index]));
    const children = new Map(currentNodes.map((node) => [node.id, []]));
    const indegree = new Map(currentNodes.map((node) => [node.id, 0]));

    currentEdges.forEach((edge) => {
      if (!idToNode.has(edge.source) || !idToNode.has(edge.target)) return;
      children.get(edge.source).push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    });

    children.forEach((list) => list.sort((a, b) => (originalIndex.get(a) || 0) - (originalIndex.get(b) || 0)));
    const roots = currentNodes
      .filter((node) => (indegree.get(node.id) || 0) === 0)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    const level = new Map();
    const queue = roots.map((node) => node.id);
    roots.forEach((node) => level.set(node.id, 0));

    while (queue.length) {
      const sourceId = queue.shift();
      const sourceLevel = level.get(sourceId) || 0;
      (children.get(sourceId) || []).forEach((targetId) => {
        const nextLevel = Math.max(level.get(targetId) ?? 0, sourceLevel + 1);
        if (!level.has(targetId) || nextLevel > level.get(targetId)) {
          level.set(targetId, nextLevel);
          queue.push(targetId);
        }
      });
    }

    currentNodes.forEach((node) => {
      if (!level.has(node.id)) level.set(node.id, 0);
    });

    const columns = new Map();
    currentNodes.forEach((node) => {
      const col = level.get(node.id) || 0;
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col).push(node);
    });
    columns.forEach((list) => list.sort((a, b) => {
      const parentA = currentEdges.find((edge) => edge.target === a.id)?.source;
      const parentB = currentEdges.find((edge) => edge.target === b.id)?.source;
      const parentDiff = (level.get(parentA) || 0) - (level.get(parentB) || 0);
      return parentDiff || a.position.y - b.position.y || (originalIndex.get(a.id) || 0) - (originalIndex.get(b.id) || 0);
    }));

    const startX = -220;
    const startY = 40;
    const columnGap = 360;
    const rowGap = 280;
    const posMap = new Map();
    [...columns.keys()].sort((a, b) => a - b).forEach((col) => {
      columns.get(col).forEach((node, row) => {
        posMap.set(node.id, { x: startX + col * columnGap, y: startY + row * rowGap });
      });
    });

    setNodes((prev) => prev.map((node) => posMap.has(node.id) ? { ...node, position: posMap.get(node.id) } : node));
    addLog('已按照连接顺序自动排版。', 'success');
    setTimeout(() => reactFlow.fitView({ padding: 0.25, duration: 500 }), 80);
  }, [reactFlow, setNodes, addLog]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      const editing = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
      if (editing) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setNodes((prev) => prev.map((node) => ({ ...node, selected: true })));
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteSelection();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setNodes, copySelection, pasteSelection, deleteSelection]);

  const progress = useMemo(() => {
    if (!logs.length) return 0;
    const done = logs.filter((item) => item.type === 'success').length;
    return Math.min(100, Math.round((done / Math.max(logs.length, 1)) * 100));
  }, [logs]);

  const nodeTypes = useMemo(() => ({ imageNode: ImageNode, textNode: TextNode, generateNode: GenerateNode, upscaleNode: UpscaleNode, reverseNode: ReverseNode, groupNode: GroupNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: EdgeWithDeleteButton }), []);
  const enhancedNodes = useMemo(() => nodes.map(withCommonData), [nodes, withCommonData]);

  return (
    <div className="app-shell">
      <LeftPanel logs={logs} progress={progress} addImageNodeFromUpload={addImageNodeFromUpload} runAll={runAll} queueRunning={queueRunning} />
      <main className="canvas-area" ref={flowWrapperRef} onDoubleClickCapture={onCanvasDoubleClickCapture}>
        <TopToolbar
          onSettings={() => setSettingsOpen(true)}
          onRunAll={runAll}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onAlign={alignSelected}
          onDistribute={distributeSelected}
          onAutoLayout={autoLayout}
          onFit={() => reactFlow.fitView({ padding: 0.25, duration: 500 })}
          queueRunning={queueRunning}
        />
        <ReactFlow
          nodes={enhancedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneDoubleClick={onPaneDoubleClick}
          onPaneClick={() => setMenu(null)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          selectionOnDrag
          selectionKeyCode={null}
          panOnDrag={[1]}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={['Meta', 'Control']}
          connectionRadius={42}
          connectOnClick={false}
          defaultEdgeOptions={{ type: 'customEdge', markerEnd: { type: MarkerType.ArrowClosed } }}
        >
          <Background color="#e8e1d8" gap={20} size={1.2} />
          <MiniMap className="minimap" pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
        <ContextMenu menu={menu} onPick={(type) => addNode(type, menu.flow)} onClose={() => setMenu(null)} />
        <div className="bottom-status">
          <span className="dot" />
          <span>云端直连：{getActivePlatform(settings)?.baseUrl ? '已配置' : '未配置'}</span>
          <span className="dot" />
          <span>文本：{settings.defaultTextModel}</span>
          <span className="dot" />
          <span>生图：{settings.defaultImageModel}</span>
          <span>V1.4.2</span>
        </div>
      </main>
      <ImagePreview preview={imagePreview} onClose={() => setImagePreview(null)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} setSettings={setSettings} addLog={addLog} />
      <div className="shortcut-help">
        <MousePointer2 size={13} /> 双击空白处添加节点 / 中键拖动画布 / 左键框选 / Ctrl+C、Ctrl+V 复制粘贴 / Delete 删除
      </div>
    </div>
  );
}

function ErrorBoundaryFallback({ error }) {
  return (
    <div className="error-page">
      <h1>页面出现错误</h1>
      <p>{error?.message || '未知错误'}</p>
      <button type="button" onClick={() => window.location.reload()}>刷新页面</button>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) return <ErrorBoundaryFallback error={this.state.error} />;
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <Workspace />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')).render(<App />);
