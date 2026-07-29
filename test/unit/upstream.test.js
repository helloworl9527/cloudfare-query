import assert from 'node:assert/strict';
import test from 'node:test';
import { UpstreamClient } from '../../src/shared/upstream.js';
import { UpstreamError } from '../../src/shared/errors.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('public mail calls use only bearer JWT plus optional custom auth', async () => {
  const calls = [];
  const client = new UpstreamClient({
    baseUrl: 'https://upstream.example',
    customPassword: 'custom-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return json({ results: [{ raw: 'mail', address: 'temp@example.com' }], count: 1 });
    },
  });
  await client.getMails('address-jwt', 'temp@example.com');
  assert.equal(calls[0].url, 'https://upstream.example/api/mails?limit=10&offset=0');
  assert.equal(calls[0].options.headers.authorization, 'Bearer address-jwt');
  assert.equal(calls[0].options.headers['x-custom-auth'], 'custom-secret');
});

test('getSettings confirms a bearer JWT actually belongs to the declared address', async () => {
  const client = new UpstreamClient({
    baseUrl: 'https://upstream.example',
    fetchImpl: async () => json({ address: 'temp@example.com', send_balance: 0 }),
  });
  const settings = await client.getSettings('some-jwt', 'Temp@Example.com');
  assert.equal(settings.address, 'temp@example.com');
});

test('getSettings rejects a JWT whose live upstream address does not match', async () => {
  const client = new UpstreamClient({
    baseUrl: 'https://upstream.example',
    fetchImpl: async () => json({ address: 'other@example.com' }),
  });
  await assert.rejects(client.getSettings('some-jwt', 'temp@example.com'), UpstreamError);
});

test('upstream 401, timeout and oversized body are represented without exposing body text', async () => {
  const unauthorized = new UpstreamClient({
    baseUrl: 'https://upstream.example',
    fetchImpl: async () => new Response('secret upstream diagnostic', { status: 401 }),
  });
  await assert.rejects(unauthorized.getMails('jwt', 'temp@example.com'), (error) => {
    assert.ok(error instanceof UpstreamError);
    assert.equal(error.status, 502);
    assert.equal(error.upstreamStatus, 401);
    assert.doesNotMatch(error.message, /secret upstream/u);
    return true;
  });

  const oversized = new UpstreamClient({
    baseUrl: 'https://upstream.example', maxResponseBytes: 16,
    fetchImpl: async () => json({ results: [] }, 200, { 'content-length': '999' }),
  });
  await assert.rejects(oversized.getMails('jwt', 'temp@example.com'), (error) => error.tooLarge === true);

  const timeout = new UpstreamClient({
    baseUrl: 'https://upstream.example', timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  await assert.rejects(timeout.getMails('jwt', 'temp@example.com'), (error) => error.status === 504);
});

test('Cloudflare 1102 and generic 500 responses are classified without returning their body', async () => {
  const client = new UpstreamClient({
    baseUrl: 'https://upstream.example',
    fetchImpl: async () => new Response('Worker exceeded resource limit: error 1102; private details', { status: 500 }),
  });
  await assert.rejects(client.getMails('jwt', 'temp@example.com'), (error) => {
    assert.ok(error instanceof UpstreamError);
    assert.equal(error.upstreamStatus, 500);
    assert.equal(error.upstreamCode, '1102');
    assert.doesNotMatch(error.message, /private details/u);
    return true;
  });
});

test('chunked responses are cancelled when streamed bytes cross the configured cap', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(12)); },
    cancel() { cancelled = true; },
  });
  const client = new UpstreamClient({
    baseUrl: 'https://upstream.example', maxResponseBytes: 20,
    fetchImpl: async () => new Response(stream, { status: 200 }),
  });
  await assert.rejects(client.getMails('jwt', 'temp@example.com'), (error) => error.tooLarge === true);
  assert.equal(cancelled, true);
});
