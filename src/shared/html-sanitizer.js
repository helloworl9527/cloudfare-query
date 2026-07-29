import { Parser } from 'htmlparser2';

// Mail HTML is rendered inside a sandboxed iframe that never gets
// `allow-scripts`, so script execution is already impossible in the browser.
// This sanitizer is the second, server-side layer: it drops everything that
// could execute, navigate, or reach a third-party host, so a tracking pixel
// never survives long enough to depend on the page CSP alone.

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section',
  'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr',
]);

// Tags whose *content* is dropped along with the tag itself. Everything else
// that is not allowed degrades to its text content, which keeps the readable
// parts of unusual markup instead of silently blanking the mail.
const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'head', 'title', 'template', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'audio', 'video', 'canvas', 'svg', 'math', 'form',
  'input', 'button', 'select', 'option', 'textarea', 'noscript', 'base', 'link', 'meta',
]);

const VOID_TAGS = new Set(['br', 'col', 'hr', 'img', 'wbr']);

// A mail's page-level background and padding usually live on <body>, so it is
// rewritten to a plain container rather than discarded with the document shell.
const TAG_REMAP = { body: 'div' };

const GLOBAL_ATTRIBUTES = new Set(['dir', 'lang', 'title', 'align', 'valign', 'style']);

const TAG_ATTRIBUTES = {
  a: new Set(['href', 'name']),
  img: new Set(['alt', 'width', 'height']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  font: new Set(['color', 'face', 'size']),
  ol: new Set(['start', 'type', 'reversed']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'height', 'bgcolor']),
  td: new Set(['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'nowrap']),
  th: new Set(['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'nowrap']),
  tr: new Set(['bgcolor', 'height']),
  tbody: new Set(['bgcolor']),
  thead: new Set(['bgcolor']),
  tfoot: new Set(['bgcolor']),
  div: new Set(['bgcolor']),
  time: new Set(['datetime']),
};

const SAFE_LINK_SCHEME = /^(?:https?:|mailto:|tel:)/iu;

// Whitespace and C0/C1 control characters, which browsers strip from URLs
// before resolving the scheme.
const URL_NOISE = /[\s\u0000-\u001F\u007F-\u009F]/gu;

// Any CSS construct that can fetch a remote resource, escape the mail body, or
// pin content over the surrounding page.
const UNSAFE_CSS = /(?:url\s*\(|expression\s*\(|@import|javascript\s*:|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky))/iu;

const MAX_TAG_DEPTH = 100;

function escapeText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

// Cuts already-escaped text to a byte budget without splitting a multi-byte
// character or leaving a half-written entity such as `&am` behind.
function truncateEscapedText(value, maxBytes) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return value;
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer.subarray(0, maxBytes));
  if (text.endsWith('�')) text = text.slice(0, -1);
  return text.replace(/&[a-z]*$/iu, '');
}

// Scheme detection runs on a copy with whitespace and control characters
// removed, so a `java&#10;script:` href cannot slip through; the value that
// gets emitted is the original.
function isSafeLink(value) {
  const collapsed = value.replace(URL_NOISE, '');
  if (collapsed.startsWith('#')) return true;
  return SAFE_LINK_SCHEME.test(collapsed);
}

// Inline styles are kept because they carry nearly all of a mail's layout, but
// every declaration that could load or position something is dropped.
function sanitizeStyle(value) {
  const declarations = [];
  for (const declaration of value.split(';')) {
    const trimmed = declaration.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    if (UNSAFE_CSS.test(trimmed)) continue;
    if (trimmed.length > 300) continue;
    declarations.push(trimmed);
  }
  return declarations.join('; ').slice(0, 2000);
}

function sanitizeAttributes(tag, attributes) {
  const allowed = TAG_ATTRIBUTES[tag];
  const parts = [];
  for (const [rawName, rawValue] of Object.entries(attributes)) {
    const name = rawName.toLowerCase();
    if (name.startsWith('on') || name.startsWith('xmlns') || name.startsWith('xlink')) continue;
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowed?.has(name)) continue;
    const value = typeof rawValue === 'string' ? rawValue : '';
    if (value.length > 4096) continue;

    if (name === 'style') {
      const style = sanitizeStyle(value);
      if (style) parts.push(` style="${escapeAttribute(style)}"`);
      continue;
    }
    if (name === 'href') {
      if (!isSafeLink(value)) continue;
      parts.push(` href="${escapeAttribute(value.trim())}"`);
      continue;
    }
    parts.push(` ${name}="${escapeAttribute(value)}"`);
  }

  // Links leave the sandbox in a new tab and must never carry a referrer.
  if (tag === 'a') {
    parts.push(' target="_blank"', ' rel="noopener noreferrer nofollow"');
  }
  // `src` is never allowlisted, so every image is inert; the alt text stays so
  // the mail still reads correctly where a picture used to be.
  if (tag === 'img') {
    parts.push(' data-nfq-blocked="1"');
  }
  return parts.join('');
}

/**
 * Rewrites mail HTML into an allowlisted, resource-free fragment.
 *
 * @param {string} html raw HTML body from the MIME parser
 * @param {{ maxBytes?: number }} options output budget in UTF-8 bytes
 * @returns {{ html: string, truncated: boolean, blockedImages: number }}
 */
export function sanitizeMailHtml(html, { maxBytes = 200 * 1024 } = {}) {
  if (typeof html !== 'string' || html.length === 0) {
    return { html: '', truncated: false, blockedImages: 0 };
  }

  const output = [];
  // Every non-void allowed tag is pushed here, including the ones that were
  // not emitted, so a close event always pairs with the right open event.
  const openTags = [];
  let bytes = 0;
  let truncated = false;
  let blockedImages = 0;
  let dropDepth = 0;

  // Emission stops at the budget instead of throwing, so an oversized mail
  // still renders its beginning and the open tags below get closed cleanly.
  function emit(chunk) {
    if (truncated || chunk === '') return false;
    const size = Buffer.byteLength(chunk, 'utf8');
    if (bytes + size > maxBytes) {
      truncated = true;
      return false;
    }
    bytes += size;
    output.push(chunk);
    return true;
  }

  const parser = new Parser({
    onopentag(name, attributes) {
      const raw = name.toLowerCase();
      const tag = TAG_REMAP[raw] ?? raw;
      if (dropDepth > 0) {
        if (!VOID_TAGS.has(tag)) dropDepth += 1;
        return;
      }
      if (DROP_CONTENT_TAGS.has(tag)) {
        if (!VOID_TAGS.has(tag)) dropDepth = 1;
        return;
      }
      if (!ALLOWED_TAGS.has(tag)) return;

      const emitTag = !truncated && openTags.length < MAX_TAG_DEPTH;
      if (emitTag && tag === 'img') blockedImages += 1;

      if (VOID_TAGS.has(tag)) {
        if (emitTag) emit(`<${tag}${sanitizeAttributes(tag, attributes)}>`);
        return;
      }
      openTags.push({ tag, emitted: emitTag && emit(`<${tag}${sanitizeAttributes(tag, attributes)}>`) });
    },
    // Text is the one node type worth splitting at the budget: cutting a long
    // paragraph mid-sentence reads far better than dropping it whole.
    ontext(text) {
      if (dropDepth > 0 || truncated) return;
      const escaped = escapeText(text);
      if (emit(escaped)) return;
      truncated = false;
      const remaining = maxBytes - bytes;
      if (remaining > 0) emit(truncateEscapedText(escaped, remaining));
      truncated = true;
    },
    onclosetag(name) {
      const raw = name.toLowerCase();
      const tag = TAG_REMAP[raw] ?? raw;
      if (dropDepth > 0) {
        if (!VOID_TAGS.has(tag)) dropDepth -= 1;
        return;
      }
      if (VOID_TAGS.has(tag) || openTags.at(-1)?.tag !== tag) return;
      // Closing tags are emitted past the budget on purpose: a truncated body
      // must still be balanced, and the overshoot is bounded by MAX_TAG_DEPTH.
      if (openTags.pop().emitted) output.push(`</${tag}>`);
    },
  }, { decodeEntities: true, recognizeSelfClosing: true });

  parser.write(html);
  parser.end();

  while (openTags.length > 0) {
    const open = openTags.pop();
    if (open.emitted) output.push(`</${open.tag}>`);
  }

  return { html: output.join(''), truncated, blockedImages };
}
