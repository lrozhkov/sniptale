// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createCropFrameGate } from './crop-frame-gate';

const geometry = {
  outputSize: { height: 300, width: 300 },
  sourceRect: { height: 600, width: 600, x: 20, y: 40 },
};

function createVideoFixture() {
  let callback: (() => void) | null = null;
  const video = document.createElement('video');
  Object.defineProperties(video, {
    cancelVideoFrameCallback: { configurable: true, value: vi.fn() },
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn((next: () => void) => {
        callback = next;
        return 17;
      }),
    },
    videoHeight: { configurable: true, value: 1080 },
    videoWidth: { configurable: true, value: 1920 },
  });
  return {
    presentFrame: () => {
      if (!callback) throw new Error('Fresh-frame callback is unavailable');
      const current = callback;
      callback = null;
      current();
    },
    video,
  };
}

async function completeTransition(
  gate: ReturnType<typeof createCropFrameGate>,
  presentFrame: () => void,
  transitionId: string
): Promise<void> {
  expect(gate.setFrozen(transitionId, true)).toBe('applied');
  const frame = gate.waitForFreshFrame(transitionId);
  presentFrame();
  await expect(frame).resolves.toEqual({ height: 1080, width: 1920 });
  expect(gate.applyFreshGeometry(transitionId, geometry)).toBe('applied');
  expect(gate.setFrozen(transitionId, false)).toBe('applied');
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('rejects a fresh frame whose source dimensions are invalid', async () => {
  let presentFreshFrame!: () => void;
  const video = document.createElement('video');
  Object.defineProperties(video, {
    cancelVideoFrameCallback: { configurable: true, value: vi.fn() },
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        presentFreshFrame = callback;
        return 17;
      }),
    },
    videoHeight: { configurable: true, value: 720 },
    videoWidth: { configurable: true, value: 0 },
  });
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: false,
    video,
  });

  expect(gate.setFrozen('navigation-1', true)).toBe('applied');
  const frame = gate.waitForFreshFrame('navigation-1');
  presentFreshFrame();

  await expect(frame).rejects.toThrow('Crop source width must be a positive integer');
  gate.stop();
});

it('rejects replay of an older frozen transition after a newer token takes authority', () => {
  const { video } = createVideoFixture();
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: false,
    video,
  });

  expect(gate.setFrozen('navigation-a', true)).toBe('applied');
  expect(gate.setFrozen('navigation-b', true)).toBe('applied');
  expect(gate.setFrozen('navigation-a', true)).toBe('stale');
  expect(gate.setFrozen('navigation-b', true)).toBe('applied');
});

it('retires completed transitions when a newer transition is accepted', async () => {
  const { presentFrame, video } = createVideoFixture();
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: false,
    video,
  });

  await completeTransition(gate, presentFrame, 'navigation-a');
  expect(gate.setFrozen('navigation-b', true)).toBe('applied');
  expect(gate.setFrozen('navigation-a', false)).toBe('stale');
  const frame = gate.waitForFreshFrame('navigation-b');
  presentFrame();
  await frame;
  expect(gate.applyFreshGeometry('navigation-b', geometry)).toBe('applied');
  expect(gate.setFrozen('navigation-b', false)).toBe('applied');
  expect(gate.setFrozen('navigation-a', true)).toBe('stale');
});
