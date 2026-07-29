import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeMailHtml } from '../../src/shared/html-sanitizer.js';

test('layout markup a mail depends on survives sanitizing', () => {
  const { html } = sanitizeMailHtml(
    '<table border="1" cellpadding="4"><tr><td bgcolor="#eee" style="font-size:14px">'
    + '<b>cell</b></td></tr></table><hr><p align="center">tail</p>',
  );
  assert.equal(
    html,
    '<table border="1" cellpadding="4"><tr><td bgcolor="#eee" style="font-size:14px">'
    + '<b>cell</b></td></tr></table><hr><p align="center">tail</p>',
  );
});

test('executable markup is removed along with its content', () => {
  const { html } = sanitizeMailHtml(
    '<script>alert(1)</script><style>body{color:red}</style>'
    + '<iframe src="https://evil.example"></iframe><form><input name="pw"></form>'
    + '<p onclick="alert(2)" onmouseover="alert(3)">text</p>',
  );
  assert.equal(html, '<p>text</p>');
});

test('every image loses its source and is counted', () => {
  const { html, blockedImages } = sanitizeMailHtml(
    '<img src="https://tracker.example/p.gif" width="1" height="1" alt="pixel">'
    + '<img srcset="https://cdn.example/a.png 2x" alt="hero">',
  );
  assert.doesNotMatch(html, /src|tracker\.example|cdn\.example/u);
  assert.match(html, /alt="pixel"/u);
  assert.equal(blockedImages, 2);
});

test('only navigable link schemes are kept, and links open detached', () => {
  const { html } = sanitizeMailHtml(
    '<a href="https://ok.example/a?b=1">ok</a>'
    + '<a href="javascript:alert(1)">js</a>'
    + '<a href="java&#10;script:alert(1)">split</a>'
    + '<a href="data:text/html,<b>x">data</a>'
    + '<a href="mailto:someone@example.com">mail</a>',
  );
  assert.match(html, /<a href="https:\/\/ok\.example\/a\?b=1" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/u);
  assert.match(html, /<a href="mailto:someone@example\.com"/u);
  assert.doesNotMatch(html, /javascript:|data:text/u);
  // The unsafe anchors keep their text but lose the destination.
  assert.match(html, />js</u);
  assert.match(html, />split</u);
});

test('inline CSS that can fetch or reposition is dropped declaration by declaration', () => {
  const { html } = sanitizeMailHtml(
    '<div style="color:red;background:url(https://x.example/a.png);position:fixed;'
    + 'top:0;font-weight:bold">s</div>',
  );
  assert.equal(html, '<div style="color:red; top:0; font-weight:bold">s</div>');
});

test('unknown tags degrade to their text while their markup disappears', () => {
  const { html } = sanitizeMailHtml('<custom-widget data-x="1">visible <b>text</b></custom-widget>');
  assert.equal(html, 'visible <b>text</b>');
});

test('text is escaped so mail content cannot re-enter as markup', () => {
  const { html } = sanitizeMailHtml('<p>5 &lt; 6 &amp; 7 &gt; 4</p>');
  assert.equal(html, '<p>5 &lt; 6 &amp; 7 &gt; 4</p>');
});

test('malformed nesting is closed and the tag depth is capped', () => {
  assert.equal(sanitizeMailHtml('<p>a<b>b<i>c').html, '<p>a<b>b<i>c</i></b></p>');
  // The trailing empty paragraph is the parser applying the HTML rule that a
  // stray </p> opens one; it is inert, so it is left alone.
  assert.equal(sanitizeMailHtml('<div><p>a</div></p>').html, '<div><p>a</p></div><p></p>');

  const deep = '<div>'.repeat(400);
  const { html } = sanitizeMailHtml(`${deep}deep${'</div>'.repeat(400)}`);
  assert.equal((html.match(/<div>/gu) ?? []).length, 100);
  assert.equal((html.match(/<\/div>/gu) ?? []).length, 100);
  assert.match(html, /deep/u);
});

test('the byte budget cuts text mid-node without breaking entities or UTF-8', () => {
  const long = sanitizeMailHtml(`<p>${'界'.repeat(500)}</p>`, { maxBytes: 200 });
  assert.equal(long.truncated, true);
  assert.doesNotMatch(long.html, /�/u);
  assert.ok(long.html.endsWith('</p>'));

  const entities = sanitizeMailHtml(`<p>${'a&b'.repeat(200)}</p>`, { maxBytes: 60 });
  assert.doesNotMatch(entities.html, /&[a-z]*</u);
});

test('empty and non-string bodies produce an empty result', () => {
  for (const value of ['', null, undefined, 42]) {
    assert.deepEqual(sanitizeMailHtml(value), { html: '', truncated: false, blockedImages: 0 });
  }
});
