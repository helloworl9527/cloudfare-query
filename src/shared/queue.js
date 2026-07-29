import { AppError, OverloadedError, RequestAbortedError } from './errors.js';

function cancellationReason(signal) {
  return signal?.reason instanceof AppError
    ? signal.reason
    : new RequestAbortedError('客户端已取消请求', signal?.reason);
}

export class WorkQueue {
  #active = 0;
  #waiting = [];

  constructor({ concurrency, maxQueue, maxWaitMs, onWait = () => {} }) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.maxWaitMs = maxWaitMs;
    this.onWait = onWait;
  }

  get active() { return this.#active; }
  get queued() { return this.#waiting.length; }

  async run(work, { totalTimeoutMs, signal: externalSignal } = {}) {
    const startedAt = Date.now();
    await this.#acquire(externalSignal);
    const queueMs = Date.now() - startedAt;
    try { this.onWait(queueMs); } catch { /* metrics must never leak a work slot */ }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(cancellationReason(externalSignal));
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    if (externalSignal?.aborted) onExternalAbort();
    const remaining = totalTimeoutMs ? totalTimeoutMs - queueMs : null;
    if (remaining !== null && remaining <= 0) {
      externalSignal?.removeEventListener('abort', onExternalAbort);
      this.#release();
      throw new OverloadedError('请求在队列中等待超时');
    }
    const timer = remaining === null ? null : setTimeout(() => {
      controller.abort(new OverloadedError('请求总处理时间超限'));
    }, remaining);

    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      const result = await work({ signal: controller.signal, queueMs, startedAt });
      if (controller.signal.aborted) throw controller.signal.reason;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      this.#release();
    }
  }

  #acquire(signal) {
    if (signal?.aborted) throw cancellationReason(signal);
    if (this.#active < this.concurrency) {
      this.#active += 1;
      return Promise.resolve();
    }
    if (this.#waiting.length >= this.maxQueue) {
      throw new OverloadedError('处理队列已满');
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, expired: false, timer: null, signal, onAbort: null };
      const remove = () => {
        const index = this.#waiting.indexOf(entry);
        if (index !== -1) this.#waiting.splice(index, 1);
      };
      entry.timer = setTimeout(() => {
        entry.expired = true;
        remove();
        signal?.removeEventListener('abort', entry.onAbort);
        reject(new OverloadedError('请求在队列中等待超时'));
      }, this.maxWaitMs);
      entry.onAbort = () => {
        entry.expired = true;
        clearTimeout(entry.timer);
        remove();
        signal?.removeEventListener('abort', entry.onAbort);
        reject(cancellationReason(signal));
      };
      this.#waiting.push(entry);
      signal?.addEventListener('abort', entry.onAbort, { once: true });
      if (signal?.aborted) entry.onAbort();
    });
  }

  #release() {
    while (this.#waiting.length > 0) {
      const next = this.#waiting.shift();
      if (next.expired) continue;
      clearTimeout(next.timer);
      next.signal?.removeEventListener('abort', next.onAbort);
      next.resolve();
      return;
    }
    this.#active = Math.max(0, this.#active - 1);
  }
}

export class Semaphore {
  #active = 0;
  #waiting = [];

  constructor(concurrency) {
    this.concurrency = concurrency;
  }

  async run(work, signal) {
    await this.#acquire(signal);
    try {
      if (signal?.aborted) throw signal.reason;
      return await work();
    } finally {
      this.#release();
    }
  }

  #acquire(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.#active < this.concurrency) {
      this.#active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal, onAbort: null };
      entry.onAbort = () => {
        const index = this.#waiting.indexOf(entry);
        if (index !== -1) this.#waiting.splice(index, 1);
        signal.removeEventListener('abort', entry.onAbort);
        reject(signal.reason);
      };
      this.#waiting.push(entry);
      signal?.addEventListener('abort', entry.onAbort, { once: true });
      if (signal?.aborted) entry.onAbort();
    });
  }

  #release() {
    const next = this.#waiting.shift();
    if (next) {
      next.signal?.removeEventListener('abort', next.onAbort);
      next.resolve();
    } else {
      this.#active = Math.max(0, this.#active - 1);
    }
  }
}
