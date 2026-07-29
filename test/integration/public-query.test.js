import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AdminBindingsService } from '../../src/admin/bindings-service.js';
import { createPublicApp } from '../../src/public-app.js';
import { QueryService } from '../../src/public/query-service.js';
import {
  BindingsRepository,
  closeDatabases,
  openBindingsAdmin,
  openBindingsReadonly,
} from '../../src/shared/database.js';
import { MailParser } from '../../src/shared/mail.js';
import { WorkQueue } from '../../src/shared/queue.js';
import { UpstreamClient } from '../../src/shared/upstream.js';

function fakeJwt(payload) {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function raw(index, html = false) {
  return [
    `From: Sender ${index} <sender${index}@example.com>`,
    `Subject: Message ${index}`,
    'Date: Thu, 10 Jul 2026 08:30:00 +0800',
    'MIME-Version: 1.0',
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`,
    '',
    html ? `<p>Hello ${index}</p><img src="https://tracker.example/${index}">` : `Hello ${index}`,
  ].join('\r\n');
}

test('admin creation through exact upstream contract becomes a safe readonly public query', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-integration-'));
  const dbPath = join(directory, 'bindings.db');
  const key = Buffer.alloc(32, 4);
  const jwt = fakeJwt({ address: 'temp@example.net', address_id: '7' });
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    if (parsed.pathname === '/api/settings') return json({ address: 'temp@example.net', send_balance: 0 });
    if (parsed.pathname === '/api/mails') {
      return json({
        results: Array.from({ length: 12 }, (_, index) => ({
          id: 100 - index,
          raw: raw(index, index === 0),
          source: `envelope${index}@example.com`,
          address: 'temp@example.net',
          created_at: `2026-07-10 0${index % 9}:00:00`,
        })),
        count: 12,
      });
    }
    throw new Error(`unexpected upstream route ${parsed.pathname}`);
  };
  const upstream = new UpstreamClient({
    baseUrl: 'https://upstream.example', customPassword: 'custom', fetchImpl,
  });
  const adminDb = openBindingsAdmin(dbPath);
  const adminRepository = new BindingsRepository(adminDb);
  const adminService = new AdminBindingsService({
    repository: adminRepository, upstream, encryptionKey: key, logger: { error() {} },
  });
  const binding = await adminService.create({
    external_id: 'Customer+tag@Example.com', address_jwt: jwt, note: 'integration',
  }, { requestId: 'test' });
  assert.equal(binding.credential_status, 'valid');
  assert.equal(binding.address, 'temp@example.net');
  assert.throws(() => adminRepository.insert({
    externalIdDisplay: 'Other@example.com', externalIdNorm: 'other@example.com',
    address: 'temp@example.net', encryptedJwt: Buffer.from('x'), note: '',
  }), /已绑定/u);

  const publicDb = openBindingsReadonly(dbPath);
  const publicRepository = new BindingsRepository(publicDb);
  const queue = new WorkQueue({ concurrency: 4, maxQueue: 64, maxWaitMs: 15_000 });
  const queryService = new QueryService({
    repository: publicRepository,
    upstream,
    mailParser: new MailParser({ concurrency: 2 }),
    encryptionKey: key,
    queue,
    metrics: { increment() {} },
    logger: { info() {} },
  });
  const app = createPublicApp({
    queryService, queue,
    metrics: { increment() {}, observe() {}, render() { return ''; } },
    logger: { info() {}, error() {} },
  });
  const response = await app.request('https://nf.mystool.me/api/query', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ external_id: 'customer+tag@example.COM' }),
  });
  assert.equal(response.status, 200);
  const responseText = await response.text();
  const payload = JSON.parse(responseText);
  assert.equal(payload.data.messages.length, 10);
  assert.equal(payload.data.messages[0].parse_status, 'html_to_text');
  assert.match(payload.data.messages[0].body_text, /Hello 0/u);
  assert.doesNotMatch(responseText, /tracker\.example|temp@example\.net|address_jwt|signature|raw/u);
  const mailCall = calls.find((call) => call.parsed.pathname === '/api/mails');
  assert.equal(mailCall.parsed.search, '?limit=10&offset=0');
  assert.equal(mailCall.options.headers.authorization, `Bearer ${jwt}`);

  closeDatabases(publicDb, adminDb);
  rmSync(directory, { recursive: true, force: true });
});
