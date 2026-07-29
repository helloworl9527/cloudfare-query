import { UpstreamError } from './errors.js';
import { normalizeAddress } from './normalization.js';

function joinedSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('upstream timeout'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onAbort);
    },
  };
}

async function readLimited(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    try { await response.body?.cancel(); } catch { /* size failure remains authoritative */ }
    throw new UpstreamError('上游响应超过大小限制', { upstreamStatus: response.status, tooLarge: true });
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new UpstreamError('上游响应超过大小限制', { upstreamStatus: response.status, tooLarge: true });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

function upstreamCodeFrom(buffer, response) {
  const ray = response.headers.get('cf-ray');
  const preview = buffer.subarray(0, 4096).toString('utf8');
  if (/\b1102\b/u.test(preview)) return '1102';
  return ray ? `http_${response.status}_cf` : `http_${response.status}`;
}

export class UpstreamClient {
  constructor({
    baseUrl,
    customPassword = null,
    timeoutMs = 8000,
    maxResponseBytes = 16 * 1024 * 1024,
    fetchImpl = globalThis.fetch,
    onRequest = () => {},
  }) {
    this.baseUrl = baseUrl;
    this.customPassword = customPassword;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.fetchImpl = fetchImpl;
    this.onRequest = onRequest;
  }

  #headers({ jwt } = {}) {
    const headers = { accept: 'application/json' };
    if (jwt) headers.authorization = `Bearer ${jwt}`;
    if (this.customPassword) headers['x-custom-auth'] = this.customPassword;
    return headers;
  }

  async #get(path, { jwt, signal, deadline } = {}) {
    const requestDeadline = deadline ?? Date.now() + this.timeoutMs;
    const remainingMs = requestDeadline - Date.now();
    if (remainingMs <= 0) throw new UpstreamError('上游请求超时', { timeout: true });
    const abort = joinedSignal(signal, Math.min(this.timeoutMs, remainingMs));
    const started = performance.now();
    let response;
    let buffer;
    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method: 'GET',
        headers: this.#headers({ jwt }),
        signal: abort.signal,
        redirect: 'error',
      });
      buffer = await readLimited(response, this.maxResponseBytes);
      if (abort.signal.aborted) throw abort.signal.reason;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (abort.didTimeOut()) {
        throw new UpstreamError('上游请求超时', { timeout: true, cause: error });
      }
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError('无法连接上游服务', { cause: error });
    } finally {
      abort.cleanup();
      try {
        this.onRequest({
          route: path.split('?')[0],
          status: response?.status ?? 0,
          durationMs: performance.now() - started,
          bytes: buffer?.length ?? 0,
        });
      } catch { /* observability must not change the upstream contract */ }
    }

    if (!response.ok) {
      throw new UpstreamError('上游返回错误', {
        upstreamStatus: response.status,
        upstreamCode: upstreamCodeFrom(buffer, response),
      });
    }

    try {
      const parsed = JSON.parse(buffer.toString('utf8'));
      if (Date.now() > requestDeadline) {
        throw new UpstreamError('上游请求超时', { timeout: true });
      }
      return parsed;
    } catch (cause) {
      if (cause instanceof UpstreamError) throw cause;
      throw new UpstreamError('上游返回了无效 JSON', { upstreamStatus: response.status, cause });
    }
  }

  async getMails(jwt, expectedAddress, { signal, deadline } = {}) {
    const data = await this.#get('/api/mails?limit=10&offset=0', { jwt, signal, deadline });
    if (!data || !Array.isArray(data.results)) {
      throw new UpstreamError('上游邮件响应结构无效');
    }
    const address = normalizeAddress(expectedAddress);
    const results = data.results.slice(0, 10);
    for (const row of results) {
      if (!row || typeof row !== 'object' || typeof row.raw !== 'string') {
        throw new UpstreamError('上游邮件记录结构无效');
      }
      try {
        if (normalizeAddress(row.address) !== address) {
          throw new UpstreamError('上游邮件地址与绑定不一致');
        }
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        throw new UpstreamError('上游邮件地址无效', { cause: error });
      }
    }
    return {
      results,
      count: Number.isFinite(Number(data.count)) ? Number(data.count) : null,
    };
  }

  async getSettings(jwt, expectedAddress, { signal, deadline } = {}) {
    const data = await this.#get('/api/settings', { jwt, signal, deadline });
    if (!data || typeof data.address !== 'string') {
      throw new UpstreamError('上游凭据自检响应结构无效');
    }
    let actual;
    try { actual = normalizeAddress(data.address); } catch (cause) {
      throw new UpstreamError('上游凭据自检返回无效地址', { cause });
    }
    if (actual !== normalizeAddress(expectedAddress)) {
      throw new UpstreamError('上游凭据自检地址不一致');
    }
    return data;
  }
}
