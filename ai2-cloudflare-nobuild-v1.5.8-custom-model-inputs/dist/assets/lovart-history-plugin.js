(function () {
  'use strict';

  const SETTINGS_KEY = 'batchrefiner_openai_endpoint_settings_v2';
  const DB_NAME = 'ai2_lovart_history_db_v1';
  const STORE_NAME = 'items';
  const COMFLY_ID = 'comfly-ai-default-platform';
  const COMFLY_BASE = 'https://ai.comfly.chat/v1';
  const MODEL_GROUPS = {
    'gpt-image-2': 'default',
    'gpt-image-2-4k': 'default',
    'gemini-3.1-flash-image-preview': 'gemini-t3',
    'gemini-3.1-pro-preview': 'Gemini优质',
    'nano-banana-pro': 'Gemini优质',
    'nano-banana-pro-4k': 'Gemini优质'
  };
  const MODEL_LIST = ['gpt-image-2', 'gemini-3.1-flash-image-preview', 'nano-banana-pro'];
  const QUALITY_LIST = ['1k', '2k', '3k', '4k'];
  const RATIO_LIST = ['自适应', '1:1', '2:3', '3:4', '4:3', '16:9', '9:16', '3:2'];

  const state = {
    activePanel: '',
    sources: [],
    sourceIndex: 0,
    mode: 'subject',
    rotate: 45,
    tilt: 0,
    scale: 'medium',
    ratio: '自适应',
    quality: '1k',
    count: 1,
    model: 'gpt-image-2',
    prompt: '',
    status: '',
    statusKind: '',
    history: []
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('type', 'type');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbTxn(mode, handler) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = handler(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).finally(() => db.close());
  }

  function dbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putHistory(item) {
    const finalItem = {
      id: item.id || `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: item.createdAt || Date.now(),
      type: item.type || 'image',
      title: item.title || 'AI 图片记录',
      ...item
    };
    await dbTxn('readwrite', (store) => store.put(finalItem));
    await refreshHistory();
    return finalItem;
  }

  async function getHistory() {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const items = await dbReq(store.getAll());
      return (items || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } finally {
      db.close();
    }
  }

  async function deleteHistory(id) {
    await dbTxn('readwrite', (store) => store.delete(id));
    await refreshHistory();
  }

  async function clearHistory() {
    await dbTxn('readwrite', (store) => store.clear());
    await refreshHistory();
  }

  function safeJson(text, fallback = null) {
    try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
  }

  function getSettings() {
    const saved = safeJson(localStorage.getItem(SETTINGS_KEY), null);
    if (saved && Array.isArray(saved.platforms)) return saved;
    return {
      platforms: [
        { id: COMFLY_ID, name: 'Comfly API（按模型自动分组 / 4K修正版）', baseUrl: COMFLY_BASE, apiKey: '' }
      ],
      activePlatformId: COMFLY_ID,
      defaultImageModel: 'gpt-image-2'
    };
  }

  function getActivePlatform() {
    const settings = getSettings();
    const platforms = settings.platforms || [];
    return platforms.find((p) => p.id === settings.activePlatformId) || platforms[0] || {};
  }

  function isComfly(platform) {
    const text = `${platform.id || ''} ${platform.name || ''} ${platform.baseUrl || ''}`.toLowerCase();
    return text.includes('comfly') || text.includes('ai.comfly.chat');
  }

  function normalizeBase(base) {
    let url = String(base || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/\/v1$/i.test(url)) url += '/v1';
    return url;
  }

  function apiUrl(platform, path) {
    const base = normalizeBase(platform.baseUrl || COMFLY_BASE);
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function proxyUrl(url) {
    if (/^https?:\/\//i.test(url) && window.location.protocol.startsWith('http')) {
      return `/api/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  function groupFor(model, platform) {
    if (isComfly(platform)) return MODEL_GROUPS[String(model || '').toLowerCase()] || 'default';
    return MODEL_GROUPS[String(model || '').toLowerCase()] || '';
  }

  function asciiOnly(text) {
    return /^[\x20-\x7E]+$/.test(String(text || ''));
  }

  function headersFor(apiKey, group, json) {
    const headers = { Authorization: `Bearer ${apiKey || ''}` };
    if (json) headers['Content-Type'] = 'application/json';
    if (group && asciiOnly(group)) {
      headers['X-Comfly-Group'] = group;
      headers['X-Model-Group'] = group;
      headers['X-Channel-Group'] = group;
    }
    return headers;
  }

  function looksImageApi(url) {
    const raw = String(url || '');
    if (/\/images\/(generations|edits|variations)/i.test(raw)) return true;
    const m = raw.match(/[?&]url=([^&]+)/);
    if (m) {
      try { return /\/images\/(generations|edits|variations)/i.test(decodeURIComponent(m[1])); } catch { return false; }
    }
    return false;
  }

  function extractBodyMeta(input, init) {
    const meta = {};
    const body = init && init.body;
    try {
      if (body instanceof FormData) {
        meta.model = String(body.get('model') || '');
        meta.prompt = String(body.get('prompt') || '').slice(0, 2000);
        meta.group = String(body.get('group') || '');
      } else if (typeof body === 'string') {
        const json = JSON.parse(body);
        meta.model = String(json.model || '');
        meta.prompt = String(json.prompt || '').slice(0, 2000);
        meta.group = String(json.group || '');
      }
    } catch {}
    return meta;
  }

  function extractImagesFromResponse(json) {
    const out = [];
    const scan = (value) => {
      if (!value) return;
      if (typeof value === 'string') {
        const s = value.trim();
        if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) out.push(s);
        else if (s.length > 180 && /^[A-Za-z0-9+/=\s]+$/.test(s) && (/^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(s))) {
          const mime = s.startsWith('/9j/') ? 'image/jpeg' : s.startsWith('R0lGOD') ? 'image/gif' : s.startsWith('UklGR') ? 'image/webp' : 'image/png';
          out.push(`data:${mime};base64,${s.replace(/\s+/g, '')}`);
        }
        return;
      }
      if (Array.isArray(value)) return value.forEach(scan);
      if (typeof value === 'object') {
        if (value.b64_json) scan(value.b64_json);
        if (value.url) scan(value.url);
        if (value.image_url) scan(typeof value.image_url === 'string' ? value.image_url : value.image_url.url);
        if (value.image) scan(value.image);
        if (value.images) scan(value.images);
        if (value.data) scan(value.data);
        if (value.output) scan(value.output);
        if (value.result) scan(value.result);
      }
    };
    scan(json);
    return Array.from(new Set(out));
  }

  async function imageSrcToFile(src, name = 'reference.png') {
    let blob;
    if (/^data:image\//i.test(src) || /^blob:/i.test(src)) {
      blob = await (await fetch(src)).blob();
    } else if (/^https?:\/\//i.test(src)) {
      try {
        blob = await (await fetch(src, { mode: 'cors' })).blob();
      } catch {
        blob = await (await fetch(proxyUrl(src))).blob();
      }
    } else {
      throw new Error('这张图的地址无法作为参考图读取。');
    }
    const type = blob.type || 'image/png';
    const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png';
    return new File([blob], name.replace(/\.[^.]+$/, '') + '.' + ext, { type });
  }

  async function urlToDataUrl(src) {
    if (!src) return '';
    if (/^data:image\//i.test(src)) return src;
    try {
      const res = await fetch(/^https?:\/\//i.test(src) ? proxyUrl(src) : src);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return src;
    }
  }

  function setStatus(text, kind = '') {
    state.status = text || '';
    state.statusKind = kind;
    render();
  }

  function getNaturalSize(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    return { w, h };
  }

  function collectSources() {
    const imgs = $$('img')
      .filter((img) => {
        const src = img.currentSrc || img.src || '';
        const { w, h } = getNaturalSize(img);
        if (!src || src.includes('lovart-history-plugin')) return false;
        if (img.closest('#ai2-lovart-plugin-root') || img.closest('.ai2-preview-overlay')) return false;
        if (w < 48 || h < 48) return false;
        return /^data:image\//i.test(src) || /^blob:/i.test(src) || /^https?:\/\//i.test(src);
      })
      .map((img, idx) => ({
        id: `${idx}-${img.currentSrc || img.src}`,
        src: img.currentSrc || img.src,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        title: img.alt || img.title || `画布图片 ${idx + 1}`
      }));
    const seen = new Set();
    state.sources = imgs.filter((item) => {
      const key = item.src.slice(0, 300);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (state.sourceIndex >= state.sources.length) state.sourceIndex = Math.max(0, state.sources.length - 1);
    updatePrompt();
    render();
  }

  function updatePrompt() {
    const modeText = state.mode === 'camera' ? 'Camera Mode：移动虚拟相机' : 'Subject Mode：旋转主体本身';
    const scaleText = state.scale === 'close' ? '近景特写' : state.scale === 'wide' ? '广角远景' : '中景';
    const angleText = `水平旋转 ${state.rotate}°，垂直俯仰 ${state.tilt}°，${scaleText}`;
    state.prompt = `请参考上传的原图，生成同一主体/同一产品的新角度视图。\n${modeText}，${angleText}。\n必须保持原产品/人物的身份一致、结构一致、比例一致、颜色一致、材质纹理一致、品牌标识和关键细节一致。只改变视角、镜头距离和透视关系，不要改变产品设计，不要添加多余文字，不要生成拼图，不要生成多张合成在一张图里。\n画面保持商业摄影/高端电商海报质感，边缘清晰，真实光影，干净背景，细节锐利。`;
  }

  function applyPreset(rotate, tilt, scale) {
    state.rotate = rotate;
    state.tilt = tilt;
    state.scale = scale;
    updatePrompt();
    render();
  }

  function responseToImages(json) {
    return extractImagesFromResponse(json);
  }

  async function parseResponse(res) {
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 800) || `HTTP ${res.status}`;
      throw new Error(`HTTP ${res.status}：${msg}`);
    }
    return json;
  }

  function sizeForGPT(ratio, quality) {
    const q = String(quality || '1k').toLowerCase();
    const long = q === '4k' ? 3840 : q === '3k' ? 3072 : q === '2k' ? 2048 : 1024;
    const presets = {
      '1:1': [long, long],
      '2:3': [Math.round((long * 2 / 3) / 16) * 16, long],
      '3:4': [Math.round((long * 3 / 4) / 16) * 16, long],
      '4:3': [long, Math.round((long * 3 / 4) / 16) * 16],
      '16:9': [long, Math.round((long * 9 / 16) / 16) * 16],
      '9:16': [Math.round((long * 9 / 16) / 16) * 16, long],
      '3:2': [long, Math.round((long * 2 / 3) / 16) * 16]
    };
    const pair = presets[ratio] || [long, long];
    return `${Math.max(256, pair[0])}x${Math.max(256, pair[1])}`;
  }

  async function runMultiAngle() {
    try {
      const source = state.sources[state.sourceIndex];
      if (!source) throw new Error('没有找到可用图片。请先在画布生成/上传图片，然后点“刷新图片”。');
      const platform = getActivePlatform();
      if (!platform.baseUrl) throw new Error('请先在右上角「API 设置」填写 API 地址。');
      if (!platform.apiKey) throw new Error(`请先在右上角「API 设置」给「${platform.name || '当前平台'}」填写 API 密钥。`);
      const model = state.model || 'gpt-image-2';
      const group = groupFor(model, platform);
      const ratio = state.ratio === '自适应' ? inferRatio(source.width, source.height) : state.ratio;
      const endpoint = apiUrl(platform, '/images/edits');
      const file = await imageSrcToFile(source.src, 'multi-angle-reference.png');
      const n = Math.max(1, Math.min(4, Number(state.count || 1)));
      const prompt = `${state.prompt}\n\n本次只生成 ${n} 张完整图片。比例：${ratio}。清晰度：${state.quality}。`;
      setStatus('正在生成多角度图片，请不要重复点击。');

      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('n', String(n));
      form.append('response_format', 'b64_json');
      form.append('image', file);
      if (/gpt-image/i.test(model)) {
        form.append('size', sizeForGPT(ratio, state.quality));
        form.append('quality', state.quality === '1k' ? 'auto' : 'high');
      } else {
        form.append('aspect_ratio', ratio || 'auto');
        form.append('image_size', String(state.quality || '1k').toUpperCase());
      }
      if (group && group !== 'default') form.append('group', group);

      const res = await fetch(proxyUrl(endpoint), {
        method: 'POST',
        headers: { ...headersFor(platform.apiKey, group, false), 'X-AI2-Lovart-Skip-History': '1' },
        body: form
      });
      const json = await parseResponse(res);
      const images = responseToImages(json);
      if (!images.length) throw new Error('接口返回成功，但没有解析到图片。');
      for (let i = 0; i < images.length; i += 1) {
        const dataUrl = await urlToDataUrl(images[i]);
        await putHistory({
          type: 'multi-angle',
          title: `多角度 ${state.rotate}° / ${state.tilt}° / ${state.scale}`,
          image: dataUrl,
          prompt,
          model,
          mode: state.mode,
          rotate: state.rotate,
          tilt: state.tilt,
          scale: state.scale,
          ratio,
          quality: state.quality,
          endpoint
        });
      }
      state.activePanel = 'history';
      setStatus(`生成完成，已保存 ${images.length} 张到历史记录。`, 'ok');
    } catch (err) {
      setStatus(err?.message || String(err), 'error');
    }
  }

  function inferRatio(w, h) {
    if (!w || !h) return '1:1';
    const r = w / h;
    const ratios = {
      '1:1': 1,
      '2:3': 2 / 3,
      '3:4': 3 / 4,
      '4:3': 4 / 3,
      '16:9': 16 / 9,
      '9:16': 9 / 16,
      '3:2': 3 / 2
    };
    return Object.keys(ratios).reduce((best, key) => Math.abs(Math.log(r / ratios[key])) < Math.abs(Math.log(r / ratios[best])) ? key : best, '1:1');
  }

  async function saveVisibleImages() {
    collectSources();
    if (!state.sources.length) {
      setStatus('当前画布没有找到可保存的图片。', 'error');
      return;
    }
    setStatus('正在保存当前画布图片到历史记录。');
    let saved = 0;
    for (const src of state.sources) {
      const dataUrl = await urlToDataUrl(src.src);
      await putHistory({
        type: 'manual-canvas-save',
        title: src.title || '手动保存画布图片',
        image: dataUrl,
        prompt: '手动保存当前画布图片',
        width: src.width,
        height: src.height
      });
      saved += 1;
    }
    setStatus(`已保存 ${saved} 张画布图片。`, 'ok');
  }

  async function refreshHistory() {
    state.history = await getHistory();
    render();
  }

  async function openPreview(item) {
    let overlay = $('.ai2-preview-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ai2-preview-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="ai2-preview-card">
        <div class="ai2-preview-head">
          <div class="ai2-preview-title"></div>
          <div class="ai2-history-actions">
            <button class="ai2-btn" data-action="download">下载</button>
            <button class="ai2-btn" data-action="close">关闭</button>
          </div>
        </div>
        <div class="ai2-preview-stage"><img draggable="true" /></div>
      </div>`;
    $('.ai2-preview-title', overlay).textContent = item.title || '历史图片预览';
    $('img', overlay).src = item.image;
    overlay.classList.add('is-open');
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.classList.remove('is-open'); };
    $('[data-action="close"]', overlay).onclick = () => overlay.classList.remove('is-open');
    $('[data-action="download"]', overlay).onclick = () => downloadImage(item);
  }

  function downloadImage(item) {
    const a = document.createElement('a');
    a.href = item.image;
    a.download = `${(item.title || 'ai-history').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copyPrompt(item) {
    try {
      await navigator.clipboard.writeText(item.prompt || '');
      setStatus('提示词已复制。', 'ok');
    } catch {
      setStatus('浏览器不允许自动复制，请打开记录后手动复制。', 'error');
    }
  }

  function historyItemHtml(item) {
    const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
    return `
      <div class="ai2-history-item" data-id="${escapeHtml(item.id)}">
        <img class="ai2-history-thumb" draggable="true" src="${escapeAttr(item.image || '')}" />
        <div class="ai2-history-meta">
          <div class="ai2-history-name" title="${escapeAttr(item.title || '')}">${escapeHtml(item.title || 'AI 图片记录')}</div>
          <div class="ai2-history-time">${escapeHtml(time)} · ${escapeHtml(item.model || item.type || '')}</div>
          <div class="ai2-history-actions">
            <button class="ai2-btn" data-act="open">打开</button>
            <button class="ai2-btn" data-act="download">下载</button>
            <button class="ai2-btn" data-act="copy">复制词</button>
            <button class="ai2-btn danger" data-act="delete">删除</button>
          </div>
        </div>
      </div>`;
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function escapeAttr(text) { return escapeHtml(text).replace(/`/g, '&#96;'); }

  function bindHistoryActions(root) {
    $$('.ai2-history-item', root).forEach((el) => {
      const id = el.getAttribute('data-id');
      const item = state.history.find((x) => x.id === id);
      if (!item) return;
      $('[data-act="open"]', el).onclick = () => openPreview(item);
      $('[data-act="download"]', el).onclick = () => downloadImage(item);
      $('[data-act="copy"]', el).onclick = () => copyPrompt(item);
      $('[data-act="delete"]', el).onclick = async () => {
        if (confirm('确定删除这条历史记录吗？')) await deleteHistory(id);
      };
    });
  }

  function panelMultiHtml() {
    const source = state.sources[state.sourceIndex];
    return `
      <div class="ai2-lovart-head">
        <div><div class="ai2-lovart-title">多角度调节</div><div class="ai2-lovart-sub">类似 Lovart Multi-Angles：选画布图，调旋转/俯仰/远近，再生成同一主体的新角度。</div></div>
        <button class="ai2-lovart-close" data-close>×</button>
      </div>
      <div class="ai2-lovart-body">
        <div class="ai2-row ai2-between">
          <button class="ai2-btn" data-refresh-sources>刷新画布图片</button>
          <span class="ai2-mini">找到 ${state.sources.length} 张</span>
        </div>
        <div class="ai2-field">
          <label>参考图片</label>
          <select data-source-select>${state.sources.map((s, i) => `<option value="${i}" ${i === state.sourceIndex ? 'selected' : ''}>${escapeHtml(s.title || `画布图片 ${i + 1}`)} · ${s.width || '?'}×${s.height || '?'}</option>`).join('')}</select>
          <div class="ai2-source-preview">${source ? `<img src="${escapeAttr(source.src)}" />` : '<span class="ai2-mini">先在画布生成/上传图片，再点刷新</span>'}</div>
        </div>
        <div class="ai2-field"><label>模式</label><div class="ai2-chip-row">
          <button class="ai2-chip ${state.mode === 'subject' ? 'active' : ''}" data-mode="subject">主体模式</button>
          <button class="ai2-chip ${state.mode === 'camera' ? 'active' : ''}" data-mode="camera">相机模式</button>
        </div></div>
        <div class="ai2-two">
          <div class="ai2-field"><label>模型</label><select data-model>${MODEL_LIST.map((m) => `<option ${m === state.model ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          <div class="ai2-field"><label>清晰度</label><select data-quality>${QUALITY_LIST.map((q) => `<option ${q === state.quality ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
        </div>
        <div class="ai2-two">
          <div class="ai2-field"><label>比例</label><select data-ratio>${RATIO_LIST.map((r) => `<option ${r === state.ratio ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="ai2-field"><label>数量</label><select data-count>${[1,2,3,4].map((n) => `<option value="${n}" ${n === Number(state.count) ? 'selected' : ''}>${n} 张</option>`).join('')}</select></div>
        </div>
        <div class="ai2-field"><label>水平旋转：${state.rotate}°</label><input type="range" min="-180" max="180" step="15" value="${state.rotate}" data-rotate /></div>
        <div class="ai2-field"><label>垂直俯仰：${state.tilt}°</label><input type="range" min="-45" max="60" step="15" value="${state.tilt}" data-tilt /></div>
        <div class="ai2-field"><label>镜头远近</label><div class="ai2-chip-row">
          ${['close','medium','wide'].map((s) => `<button class="ai2-chip ${state.scale === s ? 'active' : ''}" data-scale="${s}">${s === 'close' ? '近景' : s === 'wide' ? '广角' : '中景'}</button>`).join('')}
        </div></div>
        <div class="ai2-field"><label>快捷角度</label><div class="ai2-chip-row">
          <button class="ai2-chip" data-preset="0,0,medium">正面</button>
          <button class="ai2-chip" data-preset="45,0,medium">右45°</button>
          <button class="ai2-chip" data-preset="-45,0,medium">左45°</button>
          <button class="ai2-chip" data-preset="180,0,medium">背面</button>
          <button class="ai2-chip" data-preset="0,45,medium">俯视</button>
          <button class="ai2-chip" data-preset="0,-30,medium">仰视</button>
          <button class="ai2-chip" data-preset="30,0,close">近景</button>
          <button class="ai2-chip" data-preset="0,0,wide">广角</button>
        </div></div>
        <div class="ai2-field"><label>自动提示词（可改）</label><textarea data-prompt>${escapeHtml(state.prompt)}</textarea></div>
        <div class="ai2-row ai2-between"><button class="ai2-btn primary" data-run>生成多角度</button><span class="ai2-mini">结果会自动进历史记录</span></div>
        ${state.status ? `<div class="ai2-status ${state.statusKind}">${escapeHtml(state.status)}</div>` : ''}
      </div>`;
  }

  function panelHistoryHtml() {
    return `
      <div class="ai2-lovart-head">
        <div><div class="ai2-lovart-title">历史记录</div><div class="ai2-lovart-sub">自动保存原工具和多角度功能的图片结果，关闭网页后仍可打开；记录保存在本机浏览器 IndexedDB。</div></div>
        <button class="ai2-lovart-close" data-close>×</button>
      </div>
      <div class="ai2-lovart-body">
        <div class="ai2-row ai2-between">
          <button class="ai2-btn" data-save-visible>保存当前画布图片</button>
          <button class="ai2-btn danger" data-clear-history>清空历史</button>
        </div>
        <div class="ai2-mini">提示：历史图片可以打开、下载、删除，也可以把缩略图拖到画布里继续使用。</div>
        ${state.status ? `<div class="ai2-status ${state.statusKind}">${escapeHtml(state.status)}</div>` : ''}
        <div class="ai2-history-list">
          ${state.history.length ? state.history.map(historyItemHtml).join('') : '<div class="ai2-empty">还没有历史记录。生成图片后会自动保存，也可以手动保存当前画布图片。</div>'}
        </div>
      </div>`;
  }

  function bindPanel(root) {
    const close = $('[data-close]', root);
    if (close) close.onclick = () => { state.activePanel = ''; render(); };
    const multi = $('#ai2-panel-multi', root);
    if (multi) {
      const refresh = $('[data-refresh-sources]', multi);
      if (refresh) refresh.onclick = collectSources;
      const sourceSelect = $('[data-source-select]', multi);
      if (sourceSelect) sourceSelect.onchange = (e) => { state.sourceIndex = Number(e.target.value || 0); render(); };
      $$('[data-mode]', multi).forEach((btn) => btn.onclick = () => { state.mode = btn.dataset.mode; updatePrompt(); render(); });
      const model = $('[data-model]', multi);
      if (model) model.onchange = (e) => { state.model = e.target.value; render(); };
      const quality = $('[data-quality]', multi);
      if (quality) quality.onchange = (e) => { state.quality = e.target.value; render(); };
      const ratio = $('[data-ratio]', multi);
      if (ratio) ratio.onchange = (e) => { state.ratio = e.target.value; render(); };
      const count = $('[data-count]', multi);
      if (count) count.onchange = (e) => { state.count = Number(e.target.value || 1); render(); };
      const rotate = $('[data-rotate]', multi);
      if (rotate) rotate.oninput = (e) => { state.rotate = Number(e.target.value); updatePrompt(); render(); };
      const tilt = $('[data-tilt]', multi);
      if (tilt) tilt.oninput = (e) => { state.tilt = Number(e.target.value); updatePrompt(); render(); };
      $$('[data-scale]', multi).forEach((btn) => btn.onclick = () => { state.scale = btn.dataset.scale; updatePrompt(); render(); });
      $$('[data-preset]', multi).forEach((btn) => btn.onclick = () => {
        const [r, t, s] = String(btn.dataset.preset || '0,0,medium').split(',');
        applyPreset(Number(r), Number(t), s);
      });
      const prompt = $('[data-prompt]', multi);
      if (prompt) prompt.oninput = (e) => { state.prompt = e.target.value; };
      const run = $('[data-run]', multi);
      if (run) run.onclick = runMultiAngle;
    }
    const hist = $('#ai2-panel-history', root);
    if (hist) {
      const save = $('[data-save-visible]', hist);
      if (save) save.onclick = saveVisibleImages;
      const clear = $('[data-clear-history]', hist);
      if (clear) clear.onclick = async () => { if (confirm('确定清空全部历史记录吗？')) await clearHistory(); };
      bindHistoryActions(hist);
    }
  }

  function render() {
    let root = $('#ai2-lovart-plugin-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ai2-lovart-plugin-root';
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div id="ai2-panel-multi" class="ai2-lovart-panel ${state.activePanel === 'multi' ? 'is-open' : ''}">${panelMultiHtml()}</div>
      <div id="ai2-panel-history" class="ai2-lovart-panel ${state.activePanel === 'history' ? 'is-open' : ''}">${panelHistoryHtml()}</div>
      <div class="ai2-lovart-fab-wrap">
        <button class="ai2-lovart-fab" data-open="multi">多角度</button>
        <button class="ai2-lovart-fab" data-open="history">历史记录 ${state.history.length ? `(${state.history.length})` : ''}</button>
      </div>`;
    $$('[data-open]', root).forEach((btn) => {
      btn.onclick = () => {
        state.activePanel = state.activePanel === btn.dataset.open ? '' : btn.dataset.open;
        if (state.activePanel === 'multi') collectSources();
        else render();
      };
    });
    bindPanel(root);
  }

  function hasSkipHistoryHeader(init) {
    try {
      const headers = init && init.headers;
      if (!headers) return false;
      if (headers instanceof Headers) return headers.has('X-AI2-Lovart-Skip-History');
      return Object.keys(headers).some((key) => key.toLowerCase() === 'x-ai2-lovart-skip-history');
    } catch {
      return false;
    }
  }

  function installFetchHistoryHook() {
    if (window.__ai2LovartFetchHookInstalled) return;
    window.__ai2LovartFetchHookInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const imageApi = looksImageApi(url) && !hasSkipHistoryHeader(init || {});
      const meta = imageApi ? extractBodyMeta(input, init || {}) : {};
      const res = await originalFetch(input, init);
      if (imageApi && res && res.ok) {
        res.clone().json().then(async (json) => {
          const images = extractImagesFromResponse(json);
          for (let i = 0; i < images.length; i += 1) {
            const dataUrl = await urlToDataUrl(images[i]);
            await putHistory({
              type: 'auto-api-result',
              title: meta.model ? `自动保存 · ${meta.model}` : '自动保存 · 图片生成结果',
              image: dataUrl,
              prompt: meta.prompt || '',
              model: meta.model || '',
              group: meta.group || '',
              endpoint: url
            });
          }
        }).catch(() => {});
      }
      return res;
    };
  }

  function init() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/lovart-history-plugin.css';
    document.head.appendChild(link);
    installFetchHistoryHook();
    updatePrompt();
    render();
    refreshHistory();
    setTimeout(collectSources, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
