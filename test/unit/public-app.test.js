import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicApp } from '../../src/public-app.js';
import { NotFoundError, OverloadedError, UpstreamError } from '../../src/shared/errors.js';

function dependencies(query) {
  const logs = [];
  return {
    logs,
    app: createPublicApp({
      queryService: { query },
      queue: { active: 0, queued: 0 },
      metrics: { increment() {}, observe() {}, render() { return ''; } },
      logger: { info(event, fields) { logs.push({ event, fields }); }, error() {} },
    }),
  };
}

async function post(app, externalId = 'user@example.com') {
  return app.request('https://nf.mystool.me/api/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ external_id: externalId }),
  });
}

test('public page exposes the local email-history module', async () => {
  const { app } = dependencies(async () => ({}));
  const page = await app.request('https://nf.mystool.me/');
  const html = await page.text();
  assert.match(html, /<script src="\/app\.js" type="module"><\/script>/u);
  assert.match(html, /list="external-id-history"/u);
  assert.match(html, /id="email-history-list"/u);
  assert.match(html, /id="clear-email-history"/u);

  const moduleResponse = await app.request('https://nf.mystool.me/email-history.js');
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /^text\/javascript/u);
  assert.match(await moduleResponse.text(), /rememberSuccessfulEmail/u);
});

test('public API returns only the safe mail projection with no-store/CSP headers', async () => {
  const { app } = dependencies(async () => ({
    messages: [{
      subject: '<subject>', from: 'sender@example.com', received_at: '2026-07-10T00:00:00.000Z',
      sent_at: null, body_text: '<script>text only</script>', body_html: '<p>safe</p>',
      html_truncated: false, blocked_images: 2, truncated: false, parse_status: 'ok',
    }],
    refreshed_at: '2026-07-10T00:00:01.000Z',
  }));
  const response = await post(app);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/u);
  // The mail frame needs to exist and to apply the mail's inline styles;
  // nothing else about the public policy may loosen.
  assert.match(csp, /frame-src 'self'/u);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/u);
  assert.match(csp, /script-src 'self'/u);
  assert.match(csp, /img-src 'none'/u);
  const text = await response.text();
  assert.doesNotMatch(text, /address_jwt|raw|temp@example\.net/u);
  const payload = JSON.parse(text);
  assert.equal(payload.data.messages[0].body_text, '<script>text only</script>');
  assert.equal(payload.data.messages[0].body_html, '<p>safe</p>');
  assert.equal(payload.data.messages[0].blocked_images, 2);
});

test('the admin service keeps the strict policy with no frame or inline styles', async () => {
  const { requestMiddleware } = await import('../../src/shared/http.js');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.use('*', requestMiddleware({ service: 'admin' }));
  app.get('/admin', (c) => c.text('ok'));
  const csp = (await app.request('https://nf.mystool.me/admin')).headers.get('content-security-policy');
  assert.doesNotMatch(csp, /frame-src|unsafe-inline/u);
  assert.match(csp, /style-src 'self'/u);
});

test('public error mapping is stable and never returns upstream 401/429 directly', async () => {
  const cases = [
    [new NotFoundError(), 404, 'not_found'],
    [new UpstreamError('unauthorized', { upstreamStatus: 401 }), 502, 'upstream_unavailable'],
    [new UpstreamError('rate', { upstreamStatus: 429 }), 502, 'upstream_unavailable'],
    [new UpstreamError('timeout', { timeout: true }), 504, 'upstream_timeout'],
    [new OverloadedError(), 503, 'service_busy'],
  ];
  for (const [error, status, code] of cases) {
    const { app } = dependencies(async () => { throw error; });
    const response = await post(app);
    assert.equal(response.status, status);
    assert.notEqual(response.status, 429);
    assert.equal((await response.json()).error.code, code);
  }
});

test('request bodies are size/content-type limited', async () => {
  const { app } = dependencies(async () => { throw new Error('must not run'); });
  const wrongType = await app.request('https://nf.mystool.me/api/query', { method: 'POST', body: '{}' });
  assert.equal(wrongType.status, 400);
  const oversized = await app.request('https://nf.mystool.me/api/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ external_id: 'x'.repeat(20_000) }),
  });
  assert.equal(oversized.status, 400);
});

test('unknown attacker-controlled paths are logged only as fixed other label', async () => {
  const { app, logs } = dependencies(async () => ({}));
  const response = await app.request('https://nf.mystool.me/18371@gmail.com?external_id=secret@example.com');
  assert.equal(response.status, 404);
  const requestLog = logs.find((entry) => entry.event === 'request_complete');
  assert.equal(requestLog.fields.route, 'other');
  assert.doesNotMatch(JSON.stringify(logs), /18371|secret@example/u);
});
