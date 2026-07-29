import assert from 'node:assert/strict';
import test from 'node:test';
import { MailParser, truncateUtf8 } from '../../src/shared/mail.js';

function rawMail({ body = 'hello', contentType = 'text/plain; charset=utf-8', date = 'Thu, 10 Jul 2026 08:30:00 +0800' } = {}) {
  return [
    'From: Sender Name <sender@example.com>',
    'To: temp@example.net',
    'Subject: Test subject',
    `Date: ${date}`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
    '',
    body,
  ].join('\r\n');
}

test('plain MIME mail exposes only expected text fields and UTC timestamps', async () => {
  const parser = new MailParser();
  const [mail] = await parser.parseMany([{
    raw: rawMail(), source: 'envelope@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(mail.subject, 'Test subject');
  assert.equal(mail.from, 'Sender Name <sender@example.com>');
  assert.equal(mail.received_at, '2026-07-10T01:02:03.000Z');
  assert.equal(mail.sent_at, '2026-07-10T00:30:00.000Z');
  assert.equal(mail.body_text.trim(), 'hello');
  assert.equal(mail.parse_status, 'ok');
  assert.equal(mail.body_html, '');
  assert.deepEqual(Object.keys(mail).sort(), [
    'blocked_images', 'body_html', 'body_text', 'from', 'html_truncated', 'parse_status',
    'received_at', 'sent_at', 'subject', 'truncated',
  ]);
});

test('HTML mail keeps a sanitized HTML body and a plain-text fallback', async () => {
  const parser = new MailParser();
  const html = '<h1 style="color:#c00">Hello</h1><img src="https://tracker.example/pixel">'
    + '<script>alert(1)</script><p>Safe text</p>';
  const [mail] = await parser.parseMany([{
    raw: rawMail({ body: html, contentType: 'text/html; charset=utf-8' }),
    source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(mail.parse_status, 'html_to_text');
  assert.match(mail.body_text, /Hello/iu);
  assert.match(mail.body_text, /Safe text/u);
  assert.doesNotMatch(mail.body_text, /tracker\.example|alert\(1\)/u);

  assert.match(mail.body_html, /<h1 style="color:#c00">Hello<\/h1>/u);
  assert.match(mail.body_html, /<p>Safe text<\/p>/u);
  assert.doesNotMatch(mail.body_html, /tracker\.example|alert\(1\)|<script/u);
  assert.equal(mail.blocked_images, 1);
  assert.equal(mail.html_truncated, false);
});

test('an oversized HTML body is truncated and flagged separately from the text body', async () => {
  const parser = new MailParser({ htmlMaxBytes: 4096 });
  const html = `<div>${'<p>filler paragraph</p>'.repeat(2000)}</div>`;
  const [mail] = await parser.parseMany([{
    raw: rawMail({ body: html, contentType: 'text/html; charset=utf-8' }),
    source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(mail.html_truncated, true);
  // The closing-tag overshoot is bounded by the sanitizer's tag-depth cap.
  assert.ok(Buffer.byteLength(mail.body_html, 'utf8') <= 4096 + 1024);
  assert.match(mail.body_html, /^<div><p>filler paragraph<\/p>/u);
  assert.ok(mail.body_html.endsWith('</div>'));
});

test('body truncation is UTF-8 safe and capped at 100 KiB', async () => {
  const parser = new MailParser({ bodyMaxBytes: 100 * 1024 });
  const [mail] = await parser.parseMany([{
    raw: rawMail({ body: '界'.repeat(100_000) }),
    source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(mail.truncated, true);
  assert.ok(Buffer.byteLength(mail.body_text, 'utf8') <= 100 * 1024);
  assert.doesNotMatch(mail.body_text, /�/u);
  assert.deepEqual(truncateUtf8('界'.repeat(10), 10), { text: '界界界', truncated: true });
});

test('10 KiB, 500 KiB and 2 MiB MIME sizes stay bounded; over-limit mail is not parsed', async () => {
  const parser = new MailParser({ rawMaxBytes: 2 * 1024 * 1024, bodyMaxBytes: 100 * 1024 });
  for (const bytes of [10 * 1024, 500 * 1024, 2 * 1024 * 1024]) {
    const header = rawMail({ body: '' });
    const raw = `${header}${'a'.repeat(Math.max(0, bytes - Buffer.byteLength(header)))}`;
    const [mail] = await parser.parseMany([{ raw, source: 'sender@example.com', created_at: '2026-07-10 01:02:03' }]);
    assert.notEqual(mail.parse_status, 'too_large');
    assert.ok(Buffer.byteLength(mail.body_text, 'utf8') <= 100 * 1024);
  }
  const [tooLarge] = await parser.parseMany([{
    raw: 'x'.repeat(2 * 1024 * 1024 + 1), source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(tooLarge.parse_status, 'too_large');
  assert.equal(tooLarge.body_text, '');
});

test('invalid MIME Date remains nullable', async () => {
  const parser = new MailParser();
  const [mail] = await parser.parseMany([{
    raw: rawMail({ date: 'not-a-date' }), source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(mail.sent_at, null);
});

test('an aborted active MIME worker is terminated and the two-worker pool recovers', async () => {
  const parser = new MailParser({ concurrency: 2 });
  const controller = new AbortController();
  const parsing = parser.parseMany([{
    raw: rawMail({ body: 'x'.repeat(2 * 1024 * 1024 - 512) }),
    source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }], { signal: controller.signal });
  controller.abort();
  await assert.rejects(parsing, (error) => error.code === 'request_cancelled');
  const [recovered] = await parser.parseMany([{
    raw: rawMail(), source: 'sender@example.com', created_at: '2026-07-10 01:02:03',
  }]);
  assert.equal(recovered.parse_status, 'ok');
  assert.ok(parser.active <= 2);
});
