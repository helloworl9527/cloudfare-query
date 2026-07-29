import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { ValidationError } from '../shared/errors.js';
import {
  installErrorHandlers,
  readJsonBody,
  requestMiddleware,
  success,
} from '../shared/http.js';
import { parsePositiveInteger } from '../shared/normalization.js';
import {
  clearSessionCookie,
  requireExactOrigin,
  requireTrustedProxy,
  trustedClientIp,
} from './session.js';

const staticFiles = {
  '/admin': { body: readFileSync(new URL('../admin-ui/index.html', import.meta.url)), type: 'text/html; charset=utf-8' },
  '/admin/': { body: readFileSync(new URL('../admin-ui/index.html', import.meta.url)), type: 'text/html; charset=utf-8' },
  '/admin/app.css': { body: readFileSync(new URL('../admin-ui/app.css', import.meta.url)), type: 'text/css; charset=utf-8' },
  '/admin/app.js': { body: readFileSync(new URL('../admin-ui/app.js', import.meta.url)), type: 'text/javascript; charset=utf-8' },
};

function searchParameters(input = {}) {
  const search = (typeof input.search === 'string' ? input.search : '').trim().normalize('NFC');
  if (search.length > 254 || /[\u0000-\u001f\u007f-\u009f]/u.test(search)) {
    throw new ValidationError('搜索条件无效');
  }
  const limitText = input.limit ?? '50';
  const offsetText = input.offset ?? '0';
  const limit = parsePositiveInteger(limitText, '分页大小', { min: 1, max: 100 });
  const offset = parsePositiveInteger(offsetText, '分页偏移', { min: 0, max: 1_000_000_000 });
  return { search, limit, offset };
}

export function createAdminApp({
  bindingService,
  sessionManager,
  origins,
  trustProxy,
  proxySecret,
  metrics,
  logger,
}) {
  const app = new Hono();
  app.use('*', requestMiddleware({ service: 'admin', logger, metrics }));

  for (const [path, file] of Object.entries(staticFiles)) {
    app.get(path, (c) => c.body(file.body, 200, { 'Content-Type': file.type }));
  }

  app.use('/admin/api/*', async (c, next) => {
    requireTrustedProxy(c, trustProxy, proxySecret);
    if (c.req.path === '/admin/api/login') return next();
    const session = sessionManager.authenticate(c);
    c.set('adminSession', session);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      requireExactOrigin(c, origins);
      const isSessionBootstrap = c.req.path === '/admin/api/session' && c.req.method === 'POST';
      if (!isSessionBootstrap) sessionManager.validateCsrf(c, session);
    }
    return next();
  });

  app.post('/admin/api/login', async (c) => {
    requireExactOrigin(c, origins);
    const body = await readJsonBody(c, 4 * 1024);
    const result = await sessionManager.login(body.password, trustedClientIp(c, trustProxy));
    c.header('Set-Cookie', result.cookie);
    c.header('X-CSRF-Token', result.csrfToken);
    return success(c, { csrf_token: result.csrfToken, expires_at: result.expiresAt });
  });

  app.post('/admin/api/session', async (c) => {
    await readJsonBody(c, 1024);
    const session = c.get('adminSession');
    const csrfToken = sessionManager.rotateCsrf(session);
    c.header('X-CSRF-Token', csrfToken);
    return success(c, { csrf_token: csrfToken, expires_at: session.expires_at });
  });

  app.post('/admin/api/logout', async (c) => {
    await readJsonBody(c, 1024);
    sessionManager.revoke(c.get('adminSession'));
    c.header('Set-Cookie', clearSessionCookie());
    return success(c, { logged_out: true });
  });

  app.get('/admin/api/bindings', (c) => success(c, bindingService.list(searchParameters())));

  app.post('/admin/api/bindings/search', async (c) => {
    const body = await readJsonBody(c);
    return success(c, bindingService.list(searchParameters(body)));
  });

  app.post('/admin/api/bindings', async (c) => {
    const body = await readJsonBody(c);
    const binding = await bindingService.create(body, {
      requestId: c.get('requestId'), signal: c.req.raw.signal,
    });
    return success(c, binding, 201);
  });

  app.patch('/admin/api/bindings/:id', async (c) => {
    const body = await readJsonBody(c);
    const binding = await bindingService.update(c.req.param('id'), body, {
      requestId: c.get('requestId'), signal: c.req.raw.signal,
    });
    return success(c, binding);
  });

  app.delete('/admin/api/bindings/:id', async (c) => {
    const body = await readJsonBody(c);
    const binding = bindingService.delete(c.req.param('id'), body, {
      requestId: c.get('requestId'),
    });
    return success(c, { deleted: true, binding });
  });

  app.post('/admin/api/bindings/:id/test', async (c) => {
    const body = await readJsonBody(c);
    const result = await bindingService.testCredential(c.req.param('id'), body, {
      requestId: c.get('requestId'), signal: c.req.raw.signal,
    });
    return success(c, result);
  });

  app.post('/admin/api/bindings/:id/credential/replace', async (c) => {
    const body = await readJsonBody(c);
    const binding = await bindingService.replaceCredential(c.req.param('id'), body, {
      requestId: c.get('requestId'), signal: c.req.raw.signal,
    });
    return success(c, binding);
  });

  app.get('/internal/health', (c) => success(c, { status: 'ok' }));
  app.get('/internal/metrics', (c) => c.text(metrics.render(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  }));

  installErrorHandlers(app, { logger, metrics });
  return app;
}
