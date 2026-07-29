import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkQueue } from '../../src/shared/queue.js';
import { OverloadedError } from '../../src/shared/errors.js';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('40 simultaneous small workflows transparently run or queue with at most four active', async () => {
  const queue = new WorkQueue({ concurrency: 4, maxQueue: 64, maxWaitMs: 1000 });
  let active = 0;
  let maximum = 0;
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) => queue.run(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await delay(3);
    active -= 1;
    return index;
  }, { totalTimeoutMs: 2000 })));
  assert.equal(results.length, 40);
  assert.equal(maximum, 4);
  assert.equal(queue.active, 0);
  assert.equal(queue.queued, 0);
});

test('queue saturation returns 503-class overload without emitting 429 semantics', async () => {
  const queue = new WorkQueue({ concurrency: 1, maxQueue: 2, maxWaitMs: 1000 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = queue.run(() => gate);
  const second = queue.run(async () => 'second');
  const third = queue.run(async () => 'third');
  await assert.rejects(queue.run(async () => 'overflow'), (error) => {
    assert.ok(error instanceof OverloadedError);
    assert.equal(error.status, 503);
    assert.notEqual(error.status, 429);
    return true;
  });
  release('first');
  assert.deepEqual(await Promise.all([first, second, third]), ['first', 'second', 'third']);
});

test('queued work expires at the configured transparent wait deadline', async () => {
  const queue = new WorkQueue({ concurrency: 1, maxQueue: 1, maxWaitMs: 20 });
  let release;
  const first = queue.run(() => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(queue.run(async () => 'late'), OverloadedError);
  release('done');
  assert.equal(await first, 'done');
});

test('client cancellation removes queued work immediately and releases active slots', async () => {
  const queue = new WorkQueue({ concurrency: 1, maxQueue: 2, maxWaitMs: 1000 });
  let release;
  const first = queue.run(() => new Promise((resolve) => { release = resolve; }));
  const queuedController = new AbortController();
  const queued = queue.run(async () => 'never', { signal: queuedController.signal });
  assert.equal(queue.queued, 1);
  queuedController.abort();
  await assert.rejects(queued, (error) => error.code === 'request_cancelled');
  assert.equal(queue.queued, 0);
  release('done');
  assert.equal(await first, 'done');

  const activeController = new AbortController();
  const active = queue.run(({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), { signal: activeController.signal });
  activeController.abort();
  await assert.rejects(active, (error) => error.code === 'request_cancelled');
  assert.equal(queue.active, 0);
});

test('metrics callbacks cannot leak a queue slot', async () => {
  const queue = new WorkQueue({
    concurrency: 1, maxQueue: 1, maxWaitMs: 100,
    onWait() { throw new Error('metrics failed'); },
  });
  assert.equal(await queue.run(async () => 'ok'), 'ok');
  assert.equal(queue.active, 0);
});
