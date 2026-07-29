import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminApp } from '../../src/admin/app.js';
import { SessionManager } from '../../src/admin/session.js';
import { hashAdminPassword } from '../../src/shared/crypto.js';
import { AdminStateRepository, closeDatabases, openAdminState } from '../../src/shared/database.js';

const ORIGIN = 'https://nf.mystool.me';
const PROXY_SECRET = 'proxy-secret-that-is-at-least-thirty-two-bytes';
const PASSWORD = 'correct horse battery staple';

function fakeBindingService() {
  const calls = [];
  const binding = {
    id: 1, external_id: 'user@example.com', address: 'temp@example.net',
    credential_status: 'valid', note: '', version: 1,
  };
  return {
    calls,
    list(input) { calls.push(['list', input]); return { items: [binding], total: 1 }; },
    async create(body) { calls.push(['create', body]); return binding; },
    async update(id, body) { calls.push(['update', id, body]); return { ...binding, ...body, version: 2 }; },
    delete(id, body) { calls.push(['delete', id, body]); return binding; },
    async testCredential(id, body) { calls.push(['test', id, body]); return { binding, mail_count: 1 }; },
    async replaceCredential(id, body) { calls.push(['replace', id, body]); return { ...binding, version: 2 }; },
  };
}

async function fixture({ ttlMs = 8 * 60 * 60 * 1000, maxFailures = 5, origins = new Set([ORIGIN]) } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-admin-app-'));
  const db = openAdminState(join(directory, 'admin-state.db'));
  const stateRepository = new AdminStateRepository(db);
  const bindingService = fakeBindingService();
  const sessionManager = new SessionManager({
    stateRepository,
    passwordHash: await hashAdminPassword(PASSWORD),
    sessionTtlMs: ttlMs,
    loginWindowMs: 10 * 60 * 1000,
    loginMaxFailures: maxFailures,
  });
  const app = createAdminApp({
    bindingService,
    sessionManager,
    origins,
    trustProxy: true,
    proxySecret: PROXY_SECRET,
    metrics: { increment() {}, observe() {}, render() { return ''; } },
    logger: { info() {}, error() {} },
  });
  return {
    app, bindingService, sessionManager, stateRepository,
    close() { closeDatabases(db); rmSync(directory, { recursive: true, force: true }); },
  };
}

function proxyHeaders(extra = {}) {
  return {
    'x-nfq-proxy-auth': PROXY_SECRET,
    'x-real-ip': '203.0.113.10',
    ...extra,
  };
}

async function login(app, password = PASSWORD, extraHeaders = {}) {
  return app.request(`${ORIGIN}/admin/api/login`, {
    method: 'POST',
    headers: proxyHeaders({ origin: ORIGIN, 'content-type': 'application/json', ...extraHeaders }),
    body: JSON.stringify({ password }),
  });
}

function bootstrapSession(app, cookie) {
  return app.request(`${ORIGIN}/admin/api/session`, {
    method: 'POST',
    headers: proxyHeaders({ cookie, origin: ORIGIN, 'content-type': 'application/json' }),
    body: '{}',
  });
}

test('admin API requires trusted reverse-proxy proof before trusting X-Real-IP', async () => {
  const f = await fixture();
  const missing = await f.app.request(`${ORIGIN}/admin/api/login`, {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-real-ip': '198.51.100.4' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(missing.status, 403);
  const forged = await login(f.app, PASSWORD, { 'x-nfq-proxy-auth': 'wrong' });
  assert.equal(forged.status, 403);
  const valid = await login(f.app);
  assert.equal(valid.status, 200);
  f.close();
});

test('multiple configured origins are each accepted, and anything else is rejected', async () => {
  const ALIAS_ORIGIN = 'https://query.baochai.cc';
  const f = await fixture({ origins: new Set([ORIGIN, ALIAS_ORIGIN]) });
  const primary = await login(f.app);
  assert.equal(primary.status, 200);
  const alias = await f.app.request(`${ALIAS_ORIGIN}/admin/api/login`, {
    method: 'POST',
    headers: proxyHeaders({ origin: ALIAS_ORIGIN, 'content-type': 'application/json' }),
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(alias.status, 200);
  const unrelated = await f.app.request(`${ORIGIN}/admin/api/login`, {
    method: 'POST',
    headers: proxyHeaders({ origin: 'https://evil.example', 'content-type': 'application/json' }),
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(unrelated.status, 403);
  f.close();
});

test('login session is server-side, 8-hour style absolute, CSRF protected and revocable', async () => {
  const f = await fixture();
  const loginResponse = await login(f.app);
  assert.equal(loginResponse.status, 200);
  const loginData = (await loginResponse.json()).data;
  const setCookie = loginResponse.headers.get('set-cookie');
  assert.match(setCookie, /Path=\/admin/u);
  assert.match(setCookie, /Secure/u);
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /SameSite=Strict/u);
  assert.doesNotMatch(setCookie, new RegExp(loginData.csrf_token, 'u'));
  const cookie = setCookie.split(';', 1)[0];

  const sessionResponse = await bootstrapSession(f.app, cookie);
  assert.equal(sessionResponse.status, 200);
  const csrf = (await sessionResponse.json()).data.csrf_token;
  assert.notEqual(csrf, loginData.csrf_token);

  const wrongOrigin = await f.app.request(`${ORIGIN}/admin/api/bindings`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: 'https://evil.example', 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ external_id: 'user@example.com', address_jwt: 'fake-jwt' }),
  });
  assert.equal(wrongOrigin.status, 403);

  const wrongCsrf = await f.app.request(`${ORIGIN}/admin/api/bindings`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': 'wrong', 'content-type': 'application/json' }),
    body: JSON.stringify({ external_id: 'user@example.com', address_jwt: 'fake-jwt' }),
  });
  assert.equal(wrongCsrf.status, 403);

  const created = await f.app.request(`${ORIGIN}/admin/api/bindings`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ external_id: 'user@example.com', address_jwt: 'fake-jwt', note: '' }),
  });
  assert.equal(created.status, 201);

  const searched = await f.app.request(`${ORIGIN}/admin/api/bindings/search`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ search: 'user@example.com', limit: 50, offset: 0 }),
  });
  assert.equal(searched.status, 200);

  const patched = await f.app.request(`${ORIGIN}/admin/api/bindings/1`, {
    method: 'PATCH', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 1, note: 'updated' }),
  });
  assert.equal(patched.status, 200);
  const tested = await f.app.request(`${ORIGIN}/admin/api/bindings/1/test`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 1 }),
  });
  assert.equal(tested.status, 200);
  const replaced = await f.app.request(`${ORIGIN}/admin/api/bindings/1/credential/replace`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 1, address_jwt: 'fake-jwt' }),
  });
  assert.equal(replaced.status, 200);
  const deleted = await f.app.request(`${ORIGIN}/admin/api/bindings/1`, {
    method: 'DELETE', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 1 }),
  });
  assert.equal(deleted.status, 200);

  const logout = await f.app.request(`${ORIGIN}/admin/api/logout`, {
    method: 'POST', headers: proxyHeaders({ cookie, origin: ORIGIN, 'x-csrf-token': csrf, 'content-type': 'application/json' }),
    body: '{}',
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/u);
  const revoked = await bootstrapSession(f.app, cookie);
  assert.equal(revoked.status, 401);
  f.close();
});

test('five failed logins in ten minutes lock the trusted IP and persist in SQLite', async () => {
  const f = await fixture();
  for (let index = 1; index <= 4; index += 1) {
    const response = await login(f.app, 'incorrect password');
    assert.equal(response.status, 401);
  }
  const fifth = await login(f.app, 'incorrect password');
  assert.equal(fifth.status, 429);
  const correctWhileLocked = await login(f.app, PASSWORD);
  assert.equal(correctWhileLocked.status, 429);
  f.close();
});

test('concurrent login guesses are serialized and persist at most five failures for one IP', async () => {
  const f = await fixture();
  const responses = await Promise.all(Array.from({ length: 20 }, () => login(f.app, 'incorrect password')));
  assert.equal(responses.filter((response) => response.status === 401).length, 4);
  assert.equal(responses.filter((response) => response.status === 429).length, 16);
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const ipHash = (await import('../../src/shared/crypto.js')).sha256('203.0.113.10');
  assert.equal(f.stateRepository.countFailures(ipHash, cutoff), 5);
  f.close();
});

test('expired server-side sessions are rejected', async () => {
  const f = await fixture({ ttlMs: 5 });
  const response = await login(f.app);
  const cookie = response.headers.get('set-cookie').split(';', 1)[0];
  await new Promise((resolve) => setTimeout(resolve, 15));
  const expired = await bootstrapSession(f.app, cookie);
  assert.equal(expired.status, 401);
  f.close();
});
