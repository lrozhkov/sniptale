import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAutosaveCoordinator } from './autosave';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const values = new Map([
    ['text', 'initial'],
    ['ui', 'basic'],
  ]);
  const capture = vi.fn((key: string) => values.get(key));
  const commit = vi.fn(async (_value: string | undefined, _key: string, _token: number) => {});
  const coordinator = createAutosaveCoordinator({
    now: () => Date.now(),
    schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
    capture,
    commit,
    classifyFailure: (error) => (error === 'conflict' ? 'stop' : 'retry'),
  });
  return { values, capture, commit, coordinator };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('captures the latest coalesced buffer only when its delay expires', async () => {
  const { coordinator, values, capture, commit } = setup();
  for (let revision = 0; revision < 100; revision++) {
    values.set('text', `edit-${revision}`);
    coordinator.request('text', { delay: 250 });
  }
  expect(capture).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith('edit-99', 'text', 100);
  coordinator.dispose();
});

it('keeps one flight and captures newer edits after the previous acknowledgement', async () => {
  const { coordinator, values, capture, commit } = setup();
  const held = deferred();
  commit.mockImplementationOnce(() => held.promise);
  coordinator.request('text', { delay: 0 });
  values.set('text', 'newer');
  coordinator.request('text', { delay: 0 });
  coordinator.request('ui', { delay: 0 });
  const barrier = coordinator.flushCaptured();
  expect(capture).toHaveBeenCalledTimes(1);
  held.resolve();
  await barrier;
  expect(commit.mock.calls.map(([value]) => value)).toEqual(['initial', 'newer', 'basic']);
  coordinator.dispose();
});

it('does not acknowledge another producer or newer edits with an older completion', async () => {
  const { coordinator, commit } = setup();
  const held = deferred();
  commit.mockImplementationOnce(() => held.promise);
  coordinator.request('ui', { delay: 0 });
  const uiBarrier = coordinator.flushCaptured(['ui']);
  coordinator.request('text', { delay: 1000 });
  let textDone = false;
  const textBarrier = coordinator.flushCaptured(['text']).then(() => {
    textDone = true;
  });
  const textHeld = deferred();
  commit.mockImplementationOnce(() => textHeld.promise);
  held.resolve();
  await uiBarrier;
  expect(textDone).toBe(false);
  textHeld.resolve();
  await textBarrier;
  coordinator.dispose();
});

it('flush captures entry tokens without accelerating a newer typing deadline', async () => {
  const { coordinator, commit } = setup();
  const held = deferred();
  commit.mockImplementationOnce(() => held.promise);
  coordinator.request('text', { delay: 0 });
  const barrier = coordinator.flushCaptured(['text']);
  coordinator.request('text', { delay: 1000 });
  held.resolve();
  await barrier;
  expect(commit).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(commit).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(commit).toHaveBeenCalledTimes(2);
  coordinator.dispose();
});

it('bounds continuous recovery edits with maxWait from the first uncaptured edit', async () => {
  const { coordinator, commit } = setup();
  for (let edit = 0; edit < 10; edit++) {
    coordinator.request('text', { delay: 250, maxWait: 1000 });
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith('initial', 'text', 10);
  coordinator.dispose();
});

it('preserves accepted explicit command order ahead of subsequently requested autosaves', async () => {
  const { coordinator, commit } = setup();
  const held = deferred();
  const events: string[] = [];
  const first = coordinator.runOrdered(async () => {
    events.push('first');
    await held.promise;
  });
  const second = coordinator.runOrdered(async () => {
    events.push('second');
  });
  commit.mockImplementation(async () => {
    events.push('save');
  });
  coordinator.request('text', { delay: 0 });
  const saved = coordinator.flushCaptured();
  held.resolve();
  await Promise.all([first, second, saved]);
  expect(events).toEqual(['first', 'second', 'save']);
  coordinator.dispose();
});

it('retries a failed buffer explicitly without an automatic retry loop', async () => {
  const { coordinator, commit } = setup();
  commit.mockRejectedValueOnce(new Error('disk unavailable'));
  coordinator.request('text', { delay: 0 });
  await expect(coordinator.flushCaptured()).rejects.toThrow('disk unavailable');
  await vi.advanceTimersByTimeAsync(5000);
  expect(commit).toHaveBeenCalledTimes(1);
  await coordinator.flushCaptured();
  expect(commit).toHaveBeenCalledTimes(2);
  coordinator.dispose();
});

it('stops all automatic producers on a conflict and rejects unrelated barriers until recovery', async () => {
  const { coordinator, commit } = setup();
  commit.mockRejectedValueOnce('conflict');
  coordinator.request('text', { delay: 0 });
  await expect(coordinator.flushCaptured(['text'])).rejects.toBe('conflict');
  coordinator.request('ui', { delay: 0 });
  await expect(coordinator.flushCaptured(['ui'])).rejects.toBe('conflict');
  expect(commit).toHaveBeenCalledTimes(1);
  coordinator.resume();
  await coordinator.flushCaptured();
  expect(commit).toHaveBeenCalledTimes(3);
  coordinator.dispose();
});

it('honours a domain stop from an explicit command while still allowing its recovery command', async () => {
  const { coordinator, commit } = setup();
  coordinator.request('text', { delay: 250 });
  await coordinator.runOrdered(async () => {
    coordinator.suspend('conflict');
  });
  await expect(coordinator.flushCaptured()).rejects.toBe('conflict');
  await vi.advanceTimersByTimeAsync(5000);
  expect(commit).not.toHaveBeenCalled();
  await coordinator.runOrdered(async () => {
    coordinator.resume();
  });
  await coordinator.flushCaptured();
  expect(commit).toHaveBeenCalledTimes(1);
  coordinator.dispose();
});

it('cancels uncaptured requests and rejects their existing barrier', async () => {
  const { coordinator, commit } = setup();
  const held = deferred();
  const busy = coordinator.runOrdered(() => held.promise);
  coordinator.request('text', { delay: 0 });
  const barrier = coordinator.flushCaptured();
  coordinator.cancel('text');
  await expect(barrier).rejects.toThrow('cancelled');
  held.resolve();
  await busy;
  expect(commit).not.toHaveBeenCalled();
  await coordinator.flushCaptured();
  coordinator.dispose();
});

it('disposal rejects barriers and unstarted commands while leaving acquired cleanup to the adapter', async () => {
  const { coordinator, commit } = setup();
  const held = deferred();
  commit.mockImplementationOnce(() => held.promise);
  coordinator.request('text', { delay: 0 });
  const barrier = coordinator.flushCaptured();
  const command = coordinator.runOrdered(async () => 'not started');
  coordinator.dispose();
  await expect(barrier).rejects.toThrow('disposed');
  await expect(command).rejects.toThrow('disposed');
  held.resolve();
  await vi.advanceTimersByTimeAsync(10000);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(() => coordinator.request('text', { delay: 0 })).toThrow('disposed');
});
