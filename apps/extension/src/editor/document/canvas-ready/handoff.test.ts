import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorCanvasReadyHandoff } from './handoff';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EditorCanvasReadyHandoff ready transitions', () => {
  it('resolves a subscriber that arrives after the generation is ready', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const generation = handoff.beginMount();
    handoff.markReady(generation);
    await expect(handoff.wait()).resolves.toBeUndefined();
  });

  it('resolves subscribers that arrive before ready exactly once', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const generation = handoff.beginMount();
    const first = handoff.wait();
    const second = handoff.wait();
    handoff.markReady(generation);
    handoff.markReady(generation);
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });
});

describe('EditorCanvasReadyHandoff lifecycle transitions', () => {
  it('rejects pending subscribers when their generation is torn down', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const pending = handoff.wait();
    const rejection = expect(pending).rejects.toThrow(
      'Editor canvas was disposed before it became ready'
    );
    handoff.tearDown();
    await rejection;
  });

  it('ignores a stale ready callback after teardown and remount', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const staleGeneration = handoff.beginMount();
    const stalePending = handoff.wait();
    const staleRejection = expect(stalePending).rejects.toThrow(
      'Editor canvas was disposed before it became ready'
    );
    handoff.tearDown();
    await staleRejection;

    const currentGeneration = handoff.beginMount();
    const currentPending = handoff.wait();
    handoff.markReady(staleGeneration);
    let resolved = false;
    void currentPending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    handoff.markReady(currentGeneration);
    await expect(currentPending).resolves.toBeUndefined();
  });
});

describe('EditorCanvasReadyHandoff remount and timeout', () => {
  it('starts a fresh generation after a ready canvas is torn down', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const firstGeneration = handoff.beginMount();
    handoff.markReady(firstGeneration);
    handoff.tearDown();
    await expect(handoff.wait()).rejects.toThrow('Editor canvas is disposed');

    const remountGeneration = handoff.beginMount();
    const remountPending = handoff.wait();
    handoff.markReady(remountGeneration);
    await expect(remountPending).resolves.toBeUndefined();
  });

  it('times out only the waiter that did not observe ready', async () => {
    const handoff = new EditorCanvasReadyHandoff();
    const pending = handoff.wait(100);
    const rejection = expect(pending).rejects.toThrow(
      'Timed out waiting for the editor canvas after 100ms'
    );
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });
});
