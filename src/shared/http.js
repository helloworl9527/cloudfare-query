import { randomUUID } from 'node:crypto';
import { AppError, UpstreamError, ValidationError } from './errors.js';

const BASE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'none'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// The public page renders each mail body in a sandboxed srcdoc iframe, which
// inherits this policy. That frame needs to exist (frame-src) and to apply the
// mail's own inline styles, which is the only reason 'unsafe-inline' appears
// here. script-src stays 'self' and the frame is never given allow-scripts, so
// mail markup still cannot execute; img-src stays 'none' because the sanitizer
// strips every image source before the body reaches the browser.
const PUBLIC_CSP = BASE_CSP
  .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
  .replace("default-src 'none'", "default-src 'none'; frame-src 'self'");

const CSP_BY_SERVICE = { public: PUBLIC_CSP };

export function requestMiddleware({ service, logger, metrics }) {
  const csp = CSP_BY_SERVICE[service] ?? BASE_CSP;
  return async (c, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    try {
      await next();
    } finally {
      c.header('Content-Security-Policy', csp);
      c.header('Cache-Control', 'no-store, max-age=0');
      c.header('Pragma', 'no-cache');
      c.header('Referrer-Policy', 'no-referrer');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('X-Frame-Options', 'DENY');
      c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
      const durationMs = performance.now() - started;
      const route = routeLabel(c.req.path);
      metrics?.increment('http_requests', { service, method: c.req.method, route, status: c.res.status });
      metrics?.observe('http_request_duration_seconds', durationMs / 1000, { service, route });
      logger?.info('request_complete', {
        request_id: requestId,
        method: c.req.method,
        route,
        status: c.res.status,
        duration_ms: Math.round(durationMs * 100) / 100,
      });
    }
  };
}

function routeLabel(path) {
  const exact = new Set([
    '/', '/app.css', '/app.js', '/email-history.js', '/api/query',
    '/admin', '/admin/', '/admin/app.css', '/admin/app.js',
    '/admin/api/login', '/admin/api/logout', '/admin/api/session', '/admin/api/bindings',
    '/admin/api/bindings/search',
    '/internal/health', '/internal/metrics',
  ]);
  if (exact.has(path)) return path;
  if (/^\/admin\/api\/bindings\/[1-9][0-9]*$/u.test(path)) return '/admin/api/bindings/:id';
  if (/^\/admin\/api\/bindings\/[1-9][0-9]*\/test$/u.test(path)) return '/admin/api/bindings/:id/test';
  if (/^\/admin\/api\/bindings\/[1-9][0-9]*\/credential\/replace$/u.test(path)) {
    return '/admin/api/bindings/:id/credential/replace';
  }
  return 'other';
}

export async function readJsonBody(c, maxBytes = 16 * 1024) {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('Content-Type 必须是 application/json');
  }
  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ValidationError('请求体过大');
  const body = c.req.raw.body;
  if (!body) throw new ValidationError('缺少 JSON 请求体');
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ValidationError('请求体过大');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch (cause) {
    if (cause instanceof ValidationError) throw cause;
    throw new ValidationError('JSON 请求体无效');
  }
}

export function success(c, data, status = 200) {
  return c.json({ ok: true, data }, status);
}

function publicError(error) {
  if (error?.status === 404) return { status: 404, code: 'not_found', message: '未找到对应绑定' };
  if (error?.status === 400) return { status: 400, code: 'invalid_request', message: '请输入有效的外部邮箱' };
  if (error?.status === 503) return { status: 503, code: 'service_busy', message: '服务繁忙，请稍后手动刷新' };
  if (error?.status === 499) return { status: 499, code: 'request_cancelled', message: '请求已取消' };
  if (error?.status === 504) return { status: 504, code: 'upstream_timeout', message: '邮件服务响应超时，请稍后重试' };
  if (error instanceof UpstreamError || error?.code === 'credential_decryption_failed') {
    return { status: 502, code: 'upstream_unavailable', message: '邮件服务暂时不可用' };
  }
  return { status: 500, code: 'internal_error', message: '查询服务暂时不可用' };
}

export function installErrorHandlers(app, { publicApi = false, logger, metrics }) {
  app.onError((error, c) => {
    const requestId = c.get('requestId') ?? randomUUID();
    logger?.error('request_error', error, { request_id: requestId, route: routeLabel(c.req.path) });
    const safe = publicApi
      ? publicError(error)
      : {
          status: error instanceof AppError ? error.status : 500,
          code: error instanceof AppError ? error.code : 'internal_error',
          message: error instanceof AppError ? error.message : '管理服务暂时不可用',
        };
    metrics?.increment('request_errors', { code: safe.code, status: safe.status });
    return c.json({
      ok: false,
      error: { code: safe.code, message: safe.message, request_id: requestId },
    }, safe.status);
  });

  app.notFound((c) => {
    const requestId = c.get('requestId') ?? randomUUID();
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/admin/api/')) {
      return c.json({
        ok: false,
        error: { code: 'not_found', message: '接口不存在', request_id: requestId },
      }, 404);
    }
    return c.text('Not Found', 404);
  });
}

export function requireNode24() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 24) {
    throw new AppError(`nf-query 生产服务要求 Node.js 24 LTS，当前为 ${process.versions.node}`, {
      code: 'unsupported_runtime',
    });
  }
}
