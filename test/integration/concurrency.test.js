import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptAddressJwt } from '../../src/shared/crypto.js';
import { MailParser } from '../../src/shared/mail.js';
import { WorkQueue } from '../../src/shared/queue.js';
import { QueryService } from '../../src/public/query-service.js';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function rawMail(body) {
  return [
    'From: sender@example.com',
    'Subject: concurrent',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
}

test('40 simultaneous real query workflows stay within 4 upstream and 2 MIME configured lanes', async () => {
  const key = Buffer.alloc(32, 8);
  const jwt = 'header.payload.signature';
  const binding = {
    id: 1,
    address: 'temp@example.net',
    address_jwt_enc: encryptAddressJwt(jwt, 'temp@example.net', key),
  };
  let activeUpstream = 0;
  let maxUpstream = 0;
  const upstream = {
    async getMails() {
      activeUpstream += 1;
      maxUpstream = Math.max(maxUpstream, activeUpstream);
      await delay(5);
      activeUpstream -= 1;
      return {
        results: [{
          raw: rawMail('x'.repeat(10 * 1024)),
          source: 'sender@example.com',
          address: 'temp@example.net',
          created_at: '2026-07-10 01:02:03',
        }],
        count: 1,
        meta: null,
      };
    },
  };
  const queue = new WorkQueue({ concurrency: 4, maxQueue: 64, maxWaitMs: 15_000 });
  const mailParser = new MailParser({ concurrency: 2 });
  const service = new QueryService({
    repository: { getByExternalNorm: () => binding },
    upstream,
    mailParser,
    encryptionKey: key,
    queue,
    metrics: { increment() {} },
    logger: { info() {} },
  });
  const started = performance.now();
  let lastBeat = performance.now();
  let maximumLag = 0;
  const heartbeat = setInterval(() => {
    const now = performance.now();
    maximumLag = Math.max(maximumLag, now - lastBeat - 10);
    lastBeat = now;
  }, 10);
  const results = await Promise.all(Array.from({ length: 40 }, () => (
    service.query('user@example.com', { totalTimeoutMs: 25_000 })
  )));
  clearInterval(heartbeat);
  const duration = performance.now() - started;
  assert.equal(results.length, 40);
  assert.ok(results.every((result) => result.messages.length === 1));
  assert.equal(maxUpstream, 4);
  assert.equal(mailParser.maximumActive, 2);
  assert.equal(queue.active, 0);
  assert.equal(queue.queued, 0);
  assert.ok(duration < 10_000, `event loop remained busy for ${duration}ms`);
  assert.ok(maximumLag < 500, `event-loop heartbeat lagged ${maximumLag}ms`);
  assert.ok(process.memoryUsage().rss < 512 * 1024 * 1024);
});

test('10 KiB, 500 KiB and 2 MiB mails parse concurrently in only two workers', async () => {
  const parser = new MailParser({ concurrency: 2, bodyMaxBytes: 100 * 1024 });
  const sizes = [10 * 1024, 500 * 1024, 2 * 1024 * 1024];
  const rows = sizes.flatMap((bytes, group) => Array.from({ length: 2 }, (_, index) => {
    const header = rawMail('');
    return {
      raw: `${header}${String(group)}${'x'.repeat(Math.max(0, bytes - Buffer.byteLength(header) - 1))}`,
      source: `sender-${group}-${index}@example.com`,
      created_at: '2026-07-10 01:02:03',
    };
  }));
  const results = await parser.parseMany(rows);
  assert.equal(results.length, 6);
  assert.equal(parser.maximumActive, 2);
  assert.ok(results.every((mail) => mail.parse_status !== 'too_large'));
  assert.ok(results.every((mail) => Buffer.byteLength(mail.body_text, 'utf8') <= 100 * 1024));
  assert.ok(process.memoryUsage().rss < 512 * 1024 * 1024);
});
