import { expect, it } from 'vitest';
import { createReviewPreviewFrameExecution } from './preview-frame-execution';

it('keeps FIFO exclusivity between independent GPU executions', async () => {
  const owner = createReviewPreviewFrameExecution(2);
  const signal = new AbortController().signal;
  const first = await owner.acquire(false, signal);
  const second = await owner.acquire(false, signal);
  const order: string[] = [];
  const exclusive = owner.acquire(true, signal).then((release) => {
    order.push('exclusive');
    return release;
  });
  const later = owner.acquire(false, signal).then((release) => {
    order.push('later');
    return release;
  });
  first();
  await Promise.resolve();
  expect(order).toEqual([]);
  second();
  const finishExclusive = await exclusive;
  expect(order).toEqual(['exclusive']);
  finishExclusive();
  const finishLater = await later;
  expect(order).toEqual(['exclusive', 'later']);
  finishLater();
  finishLater();
  const resumed = await Promise.all([owner.acquire(false, signal), owner.acquire(false, signal)]);
  for (const release of resumed) release();
});

it('removes a cancelled waiter without releasing an executing lease', async () => {
  const owner = createReviewPreviewFrameExecution(2);
  const activeController = new AbortController();
  const active = await owner.acquire(false, activeController.signal);
  const waitingController = new AbortController();
  const waiting = owner.acquire(true, waitingController.signal);
  waitingController.abort();
  await expect(waiting).rejects.toBe(waitingController.signal.reason);
  const other = await owner.acquire(false, new AbortController().signal);
  other();
  activeController.abort();
  let started = false;
  const next = owner.acquire(true, new AbortController().signal).then((release) => {
    started = true;
    return release;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  active();
  (await next)();
});

it('rejects an already aborted acquisition and preserves serial capacity', async () => {
  const owner = createReviewPreviewFrameExecution(1);
  const controller = new AbortController();
  controller.abort();
  expect(() => owner.acquire(false, controller.signal)).toThrow();
  const signal = new AbortController().signal;
  const first = await owner.acquire(false, signal);
  let started = false;
  const next = owner.acquire(false, signal).then((release) => {
    started = true;
    return release;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  first();
  (await next)();
});
