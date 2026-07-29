// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createCropFrameGate } from './crop-frame-gate';

const geometry = {
  outputSize: { height: 300, width: 300 },
  sourceRect: { height: 600, width: 600, x: 20, y: 40 },
};

function createVideoFixture() {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: 1080 },
    videoWidth: { configurable: true, value: 1920 },
  });
  return video;
}

function completeTransition(
  gate: ReturnType<typeof createCropFrameGate>,
  transitionId: string
): void {
  expect(gate.setFrozen(transitionId, true)).toBe('applied');
  expect(gate.readFrozenSourceSize(transitionId)).toEqual({ height: 1080, width: 1920 });
  expect(gate.applyFrozenSourceGeometry(transitionId, geometry)).toBe('applied');
  expect(gate.setFrozen(transitionId, false)).toBe('applied');
}

it('rejects frozen source dimensions that are invalid', () => {
  const video = document.createElement('video');
  Object.defineProperties(video, {
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
  expect(() => gate.readFrozenSourceSize('navigation-1')).toThrow(
    'Crop source width must be a positive integer'
  );
  gate.stop();
  expect(() => gate.readFrozenSourceSize('navigation-1')).toThrow('Viewport output is unavailable');
});

it('rejects replay of an older frozen transition after a newer token takes authority', () => {
  const video = createVideoFixture();
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

it('retires completed transitions when a newer transition is accepted', () => {
  const video = createVideoFixture();
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: false,
    video,
  });

  completeTransition(gate, 'navigation-a');
  expect(gate.setFrozen('navigation-b', true)).toBe('applied');
  expect(gate.setFrozen('navigation-a', false)).toBe('stale');
  expect(() => gate.readFrozenSourceSize('navigation-a')).toThrow(
    'Viewport frozen-source read was superseded'
  );
  expect(gate.readFrozenSourceSize('navigation-b')).toEqual({ height: 1080, width: 1920 });
  expect(gate.applyFrozenSourceGeometry('navigation-b', geometry)).toBe('applied');
  expect(gate.setFrozen('navigation-b', false)).toBe('applied');
  expect(gate.setFrozen('navigation-a', true)).toBe('stale');
});
