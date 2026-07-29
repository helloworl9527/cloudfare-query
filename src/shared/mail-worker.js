import { parentPort } from 'node:worker_threads';
import PostalMime from 'postal-mime';
import { convert as htmlToText } from 'html-to-text';
import { sanitizeMailHtml } from './html-sanitizer.js';

function safeString(value, maxCharacters = 1000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/gu, '').slice(0, maxCharacters);
}

function formatMailbox(mailbox) {
  if (!mailbox || typeof mailbox !== 'object') return '';
  const name = safeString(mailbox.name, 500).trim();
  const address = safeString(mailbox.address, 500).trim();
  if (name && address) return `${name} <${address}>`;
  return name || address;
}

function parseDate(value, { sqliteUtc = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  let input = value;
  if (sqliteUtc && typeof input === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(input)) {
    input = `${input.replace(' ', 'T')}Z`;
  }
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(value ?? '', 'utf8');
  if (buffer.length <= maxBytes) return { text: buffer.toString('utf8'), truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = decoder.decode(buffer.subarray(0, maxBytes));
  if (text.endsWith('\uFFFD')) text = text.slice(0, -1);
  return { text, truncated: true };
}

function htmlBodyToText(html) {
  return htmlToText(html, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
    limits: { maxInputLength: 2 * 1024 * 1024, maxChildNodes: 100_000, maxDepth: 100 },
  });
}

async function parseMail(row, bodyMaxBytes, htmlMaxBytes) {
  try {
    const parsed = await PostalMime.parse(row.raw);
    const hasPlainText = typeof parsed.text === 'string' && parsed.text.length > 0;
    const hasHtml = typeof parsed.html === 'string' && parsed.html.length > 0;
    const body = hasPlainText ? parsed.text : (hasHtml ? htmlBodyToText(parsed.html) : '');
    const { text, truncated } = truncateUtf8(body, bodyMaxBytes);
    // The rich view is preferred by the client; the text body stays as the
    // fallback view and as the only body for text-only mail.
    const rich = hasHtml
      ? sanitizeMailHtml(parsed.html, { maxBytes: htmlMaxBytes })
      : { html: '', truncated: false, blockedImages: 0 };
    const status = hasPlainText ? 'ok' : (hasHtml ? 'html_to_text' : 'no_body');
    return {
      status,
      result: {
        subject: safeString(parsed.subject),
        from: formatMailbox(parsed.from) || safeString(row.source),
        received_at: parseDate(row.created_at, { sqliteUtc: true }),
        sent_at: parseDate(parsed.date),
        body_text: text,
        body_html: rich.html,
        html_truncated: rich.truncated,
        blocked_images: rich.blockedImages,
        truncated,
        parse_status: status,
      },
    };
  } catch {
    return {
      status: 'parse_error',
      result: {
        subject: '', from: safeString(row.source),
        received_at: parseDate(row.created_at, { sqliteUtc: true }), sent_at: null,
        body_text: '', body_html: '', html_truncated: false, blocked_images: 0,
        truncated: false, parse_status: 'parse_error',
      },
    };
  }
}

parentPort.on('message', async ({ id, row, bodyMaxBytes, htmlMaxBytes }) => {
  const started = performance.now();
  const parsed = await parseMail(row, bodyMaxBytes, htmlMaxBytes);
  parentPort.postMessage({
    id,
    ok: true,
    status: parsed.status,
    durationMs: performance.now() - started,
    result: parsed.result,
  });
});
