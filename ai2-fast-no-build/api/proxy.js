import { Readable } from 'node:stream';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-encoding',
]);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function sendJson(req, res, status, payload) {
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function isBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.localhost') ||
    /^10\./.test(h) ||
    /^127\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildForwardHeaders(req) {
  const headers = new Headers();
  const allowList = ['authorization', 'content-type', 'accept', 'x-comfly-group', 'x-model-group', 'x-channel-group'];

  for (const name of allowList) {
    const value = firstHeaderValue(req.headers[name]);
    if (value) headers.set(name, value);
  }

  return headers;
}

function setResponseHeaders(req, res, upstreamHeaders) {
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    res.setHeader(key, value);
  });
}

function streamToResponse(upstream, res) {
  if (!upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(res);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(req);
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const requestUrl = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
    const target = requestUrl.searchParams.get('url') || '';

    if (!target) {
      sendJson(req, res, 400, { error: { message: '缺少目标 API 地址。' } });
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      sendJson(req, res, 400, { error: { message: '目标 API 地址格式不正确。' } });
      return;
    }

    if (!['https:', 'http:'].includes(targetUrl.protocol) || isBlockedHostname(targetUrl.hostname)) {
      sendJson(req, res, 400, { error: { message: '不允许转发到这个 API 地址。' } });
      return;
    }

    const method = String(req.method || 'GET').toUpperCase();
    const init = {
      method,
      headers: buildForwardHeaders(req),
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(method)) {
      init.body = req;
      init.duplex = 'half';
    }

    const upstream = await fetch(targetUrl.toString(), init);
    setResponseHeaders(req, res, upstream.headers);
    res.statusCode = upstream.status;
    res.statusMessage = upstream.statusText;
    streamToResponse(upstream, res);
  } catch (error) {
    sendJson(req, res, 500, {
      error: { message: error?.message || 'Vercel API 代理转发失败。' },
    });
  }
}
