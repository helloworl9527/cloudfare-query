import { Worker } from 'node:worker_threads';
import { AppError, OverloadedError, RequestAbortedError } from './errors.js';

function parseReceivedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function safeSource(value) {
  return typeof value === 'string' ? value.replace(/\u0000/gu, '').slice(0, 1000) : '';
}

function cancellationReason(signal) {
  return signal?.reason instanceof AppError
    ? signal.reason
    : new RequestAbortedError('客户端已取消请求', signal?.reason);
}

export function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(value ?? '', 'utf8');
  if (buffer.length <= maxBytes) return { text: buffer.toString('utf8'), truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = decoder.decode(buffer.subarray(0, maxBytes));
  if (text.endsWith('\uFFFD')) text = text.slice(0, -1);
  return { text, truncated: true };
}

class MailWorkerPool {
  #slots = new Set();
  #queue = [];
  #nextId = 1;
  #maximumActive = 0;

  constructor(size, maxQueue = 64) {
    this.size = size;
    this.maxQueue = maxQueue;
  }

  get active() {
    return [...this.#slots].filter((slot) => slot.job !== null).length;
  }

  get queued() { return this.#queue.length; }
  get maximumActive() { return this.#maximumActive; }

  submit(payload, signal) {
    if (signal?.aborted) return Promise.reject(cancellationReason(signal));
    if (this.#queue.length + this.active >= this.maxQueue) {
      return Promise.reject(new OverloadedError('MIME 解析队列已满'));
    }
    return new Promise((resolve, reject) => {
      const job = {
        id: this.#nextId++, payload, signal, resolve, reject,
        slot: null, settled: false, onAbort: null,
      };
      job.onAbort = () => this.#abort(job);
      this.#queue.push(job);
      signal?.addEventListener('abort', job.onAbort, { once: true });
      if (signal?.aborted) job.onAbort();
      this.#dispatch();
    });
  }

  #spawn() {
    const worker = new Worker(new URL('./mail-worker.js', import.meta.url), { type: 'module' });
    const slot = { worker, job: null, dead: false };
    this.#slots.add(slot);
    worker.unref();
    worker.on('message', (message) => this.#message(slot, message));
    worker.on('error', (error) => this.#workerFailed(slot, error));
    worker.on('exit', (code) => {
      if (!slot.dead && code !== 0) this.#workerFailed(slot, new Error(`MIME worker exited with ${code}`));
      else if (!slot.dead) {
        slot.dead = true;
        this.#slots.delete(slot);
        if (slot.job) this.#settle(slot.job, false, new AppError('MIME worker 意外退出'));
        this.#dispatch();
      }
    });
    return slot;
  }

  #dispatch() {
    while (this.#queue.length > 0) {
      let slot = [...this.#slots].find((candidate) => !candidate.dead && candidate.job === null);
      if (!slot && this.#slots.size < this.size) slot = this.#spawn();
      if (!slot) return;
      const job = this.#queue.shift();
      if (job.settled) continue;
      slot.job = job;
      job.slot = slot;
      slot.worker.ref();
      this.#maximumActive = Math.max(this.#maximumActive, this.active);
      slot.worker.postMessage({ id: job.id, ...job.payload });
    }
  }

  #message(slot, message) {
    const job = slot.job;
    if (slot.dead || !job || message?.id !== job.id) return;
    slot.job = null;
    job.slot = null;
    slot.worker.unref();
    if (message.ok) this.#settle(job, true, message);
    else this.#settle(job, false, new AppError('MIME worker 处理失败'));
    this.#dispatch();
  }

  #abort(job) {
    if (job.settled) return;
    if (!job.slot) {
      const index = this.#queue.indexOf(job);
      if (index !== -1) this.#queue.splice(index, 1);
      this.#settle(job, false, cancellationReason(job.signal));
      return;
    }
    const slot = job.slot;
    slot.dead = true;
    slot.job = null;
    this.#slots.delete(slot);
    this.#settle(job, false, cancellationReason(job.signal));
    void slot.worker.terminate().finally(() => this.#dispatch());
  }

  #workerFailed(slot, error) {
    if (slot.dead) return;
    slot.dead = true;
    this.#slots.delete(slot);
    if (slot.job) this.#settle(slot.job, false, new AppError('MIME worker 不可用', { cause: error }));
    slot.job = null;
    this.#dispatch();
  }

  #settle(job, succeeded, value) {
    if (job.settled) return;
    job.settled = true;
    job.signal?.removeEventListener('abort', job.onAbort);
    if (succeeded) job.resolve(value);
    else job.reject(value);
  }
}

const pools = new Map();

function poolFor(concurrency) {
  if (!pools.has(concurrency)) pools.set(concurrency, new MailWorkerPool(concurrency));
  return pools.get(concurrency);
}

export class MailParser {
  constructor({
    concurrency = 2, rawMaxBytes = 2 * 1024 * 1024, bodyMaxBytes = 100 * 1024,
    htmlMaxBytes = 200 * 1024, onParse = () => {},
  } = {}) {
    this.pool = poolFor(concurrency);
    this.rawMaxBytes = rawMaxBytes;
    this.bodyMaxBytes = bodyMaxBytes;
    this.htmlMaxBytes = htmlMaxBytes;
    this.onParse = onParse;
  }

  get active() { return this.pool.active; }
  get queued() { return this.pool.queued; }
  get maximumActive() { return this.pool.maximumActive; }

  async parseMany(rows, { signal } = {}) {
    return Promise.all(rows.map((row) => this.#parse(row, signal)));
  }

  async #parse(row, signal) {
    const started = performance.now();
    const rawBytes = Buffer.byteLength(row.raw, 'utf8');
    if (rawBytes > this.rawMaxBytes || rawBytes === 0) {
      const status = rawBytes > this.rawMaxBytes ? 'too_large' : 'empty';
      const result = {
        subject: '',
        from: safeSource(row.source),
        received_at: parseReceivedDate(row.created_at),
        sent_at: null,
        body_text: '',
        body_html: '',
        html_truncated: false,
        blocked_images: 0,
        truncated: status === 'too_large',
        parse_status: status,
      };
      try {
        this.onParse({
          durationMs: performance.now() - started, status, rawBytes, truncated: result.truncated,
        });
      } catch { /* metrics only */ }
      return result;
    }
    const message = await this.pool.submit({
      row: { raw: row.raw, source: row.source, created_at: row.created_at },
      bodyMaxBytes: this.bodyMaxBytes,
      htmlMaxBytes: this.htmlMaxBytes,
      rawBytes,
    }, signal);
    try {
      this.onParse({
        durationMs: message.durationMs,
        status: message.status,
        rawBytes,
        truncated: message.result.truncated,
      });
    } catch { /* metrics only */ }
    return message.result;
  }
}
