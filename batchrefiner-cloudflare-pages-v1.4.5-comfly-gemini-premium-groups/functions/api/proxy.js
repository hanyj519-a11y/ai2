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

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(request, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
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

function buildForwardHeaders(request) {
  const headers = new Headers();
  const allowList = ['authorization', 'content-type', 'accept', 'x-comfly-group', 'x-model-group', 'x-channel-group'];

  for (const name of allowList) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

function buildResponseHeaders(request, upstreamHeaders) {
  const headers = new Headers(corsHeaders(request));

  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    headers.set(key, value);
  });

  return headers;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url') || '';

    if (!target) {
      return jsonResponse(request, 400, { error: { message: '缺少目标 API 地址。' } });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return jsonResponse(request, 400, { error: { message: '目标 API 地址格式不正确。' } });
    }

    if (!['https:', 'http:'].includes(targetUrl.protocol) || isBlockedHostname(targetUrl.hostname)) {
      return jsonResponse(request, 400, { error: { message: '不允许转发到这个 API 地址。' } });
    }

    const method = request.method.toUpperCase();
    const init = {
      method,
      headers: buildForwardHeaders(request),
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(method)) {
      init.body = request.body;
    }

    const upstream = await fetch(targetUrl.toString(), init);
    const headers = buildResponseHeaders(request, upstream.headers);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    return jsonResponse(request, 500, {
      error: { message: error?.message || 'Cloudflare Pages Function 代理转发失败。' },
    });
  }
}
