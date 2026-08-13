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

it('keeps exact viewport output frozen until marked geometry and a later clean frame are verified', async () => {
  const video = createVideoFixture();
  const verifyFrame = vi
    .fn()
    .mockResolvedValueOnce({
      presentedFrames: 12,
      sourceSize: { height: 1080, width: 1920 },
      viewportRect: { height: 900, width: 1600, x: 160, y: 90 },
    })
    .mockResolvedValueOnce({
      presentedFrames: 14,
      sourceSize: { height: 1080, width: 1920 },
      viewportRect: { height: 900, width: 1600, x: 160, y: 90 },
    });
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: true,
    onSourceInvalidated: vi.fn(),
    requiresFrameVerification: true,
    verifyFrame,
    video,
  });
  const verification = {
    pattern: {
      edgeThicknessCss: 8,
      colors: {
        bottom: { blue: 210, green: 50, red: 40 },
        left: { blue: 50, green: 40, red: 210 },
        right: { blue: 40, green: 210, red: 50 },
        top: { blue: 50, green: 60, red: 220 },
      },
    },
  } as const;

  expect(gate.setFrozen('navigation-verified', true)).toBe('applied');
  gate.activate();
  await expect(
    gate.verifyFrozenSourceFrame('navigation-verified', {
      ...verification,
      phase: 'marked',
    })
  ).resolves.toMatchObject({ result: 'applied' });
  expect(
    gate.applyFrozenSourceGeometry('navigation-verified', {
      ...geometry,
      sourceRect: { height: 900, width: 1600, x: 160, y: 90 },
    })
  ).toBe('applied');
  expect(() =>
    gate.applyFrozenSourceGeometry('navigation-verified', {
      ...geometry,
      sourceRect: { height: 1080, width: 1920, x: 0, y: 0 },
    })
  ).toThrow('cannot change during a transition');
  expect(() => gate.setFrozen('navigation-verified', false)).toThrow('clean source frame');
  await expect(
    gate.verifyFrozenSourceFrame('navigation-verified', {
      ...verification,
      phase: 'clean',
    })
  ).resolves.toMatchObject({ result: 'applied' });
  expect(gate.setFrozen('navigation-verified', false)).toBe('applied');
  expect(verifyFrame).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      afterPresentedFrames: 12,
      expectedViewportRect: { height: 900, width: 1600, x: 160, y: 90 },
      phase: 'clean',
    }),
    expect.any(Function)
  );
});

it('holds the last verified frame and reports a current source-size invalidation once', async () => {
  const video = createVideoFixture();
  const onSourceInvalidated = vi.fn();
  const gate = createCropFrameGate({
    applyGeometry: vi.fn(),
    drawCurrentFrame: vi.fn(),
    initiallySuspended: false,
    onSourceInvalidated,
    requiresFrameVerification: true,
    verifyFrame: vi
      .fn()
      .mockResolvedValueOnce({
        presentedFrames: 4,
        sourceSize: { height: 1080, width: 1920 },
        viewportRect: { height: 900, width: 1600, x: 160, y: 90 },
      })
      .mockResolvedValueOnce({
        presentedFrames: 6,
        sourceSize: { height: 1080, width: 1920 },
        viewportRect: { height: 900, width: 1600, x: 160, y: 90 },
      }),
    video,
  });
  const verification = {
    pattern: {
      edgeThicknessCss: 8,
      colors: {
        bottom: { blue: 210, green: 50, red: 40 },
        left: { blue: 50, green: 40, red: 210 },
        right: { blue: 40, green: 210, red: 50 },
        top: { blue: 50, green: 60, red: 220 },
      },
    },
  } as const;

  gate.setFrozen('navigation-size', true);
  await gate.verifyFrozenSourceFrame('navigation-size', { ...verification, phase: 'marked' });
  gate.applyFrozenSourceGeometry('navigation-size', geometry);
  await gate.verifyFrozenSourceFrame('navigation-size', { ...verification, phase: 'clean' });
  gate.setFrozen('navigation-size', false);

  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: 1200 },
    videoWidth: { configurable: true, value: 2000 },
  });
  expect(gate.canDraw()).toBe(false);
  expect(gate.canEmitHeldFrame()).toBe(true);
  expect(gate.canDraw()).toBe(false);
  expect(onSourceInvalidated).toHaveBeenCalledOnce();
});
