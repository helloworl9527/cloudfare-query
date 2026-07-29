import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { readJsonBody, requestMiddleware, success, installErrorHandlers } from './shared/http.js';

const staticFiles = {
  '/': { body: readFileSync(new URL('./public/index.html', import.meta.url)), type: 'text/html; charset=utf-8' },
  '/app.css': { body: readFileSync(new URL('./public/app.css', import.meta.url)), type: 'text/css; charset=utf-8' },
  '/app.js': { body: readFileSync(new URL('./public/app.js', import.meta.url)), type: 'text/javascript; charset=utf-8' },
  '/email-history.js': { body: readFileSync(new URL('./public/email-history.js', import.meta.url)), type: 'text/javascript; charset=utf-8' },
};

export function createPublicApp({ queryService, queue, metrics, logger, queryTotalTimeoutMs = 25_000 }) {
  const app = new Hono();
  app.use('*', requestMiddleware({ service: 'public', logger, metrics }));

  for (const [path, file] of Object.entries(staticFiles)) {
    app.get(path, (c) => c.body(file.body, 200, { 'Content-Type': file.type }));
  }

  app.post('/api/query', async (c) => {
    const body = await readJsonBody(c);
    const data = await queryService.query(body.external_id, {
      totalTimeoutMs: queryTotalTimeoutMs,
      signal: c.req.raw.signal,
    });
    return success(c, data);
  });

  app.get('/internal/health', (c) => success(c, { status: 'ok' }));
  app.get('/internal/metrics', (c) => c.text(metrics.render({
    workflow_active: queue.active,
    workflow_queued: queue.queued,
    mime_active: queryService.mailParser.active,
    mime_queued: queryService.mailParser.queued,
  }), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }));

  installErrorHandlers(app, { publicApi: true, logger, metrics });
  return app;
}
