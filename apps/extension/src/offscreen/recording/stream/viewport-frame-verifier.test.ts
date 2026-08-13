// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import type { ViewportCalibrationPattern } from '@sniptale/runtime-contracts/video/types/viewport-calibration';
import { createViewportFrameVerifier } from './viewport-frame-verifier';

const pattern: ViewportCalibrationPattern = {
  edgeThicknessCss: 8,
  colors: {
    top: { red: 236, green: 32, blue: 58 },
    right: { red: 38, green: 220, blue: 75 },
    bottom: { red: 42, green: 72, blue: 232 },
    left: { red: 226, green: 42, blue: 214 },
  },
};

const width = 100;
const height = 80;

function paintRect(
  pixels: Uint8ClampedArray,
  rect: { height: number; width: number; x: number; y: number },
  color: { blue: number; green: number; red: number }
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = color.red;
      pixels[offset + 1] = color.green;
      pixels[offset + 2] = color.blue;
      pixels[offset + 3] = 255;
    }
  }
}

function createFrame(marked: boolean): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  paintRect(pixels, { x: 0, y: 0, width, height }, { red: 36, green: 99, blue: 145 });
  if (!marked) {
    paintRect(pixels, { x: 35, y: 35, width: 20, height: 10 }, pattern.colors.bottom);
    return pixels;
  }
  paintRect(pixels, { x: 10, y: 5, width: 80, height: 8 }, pattern.colors.top);
  paintRect(pixels, { x: 10, y: 67, width: 80, height: 8 }, pattern.colors.bottom);
  paintRect(pixels, { x: 10, y: 13, width: 8, height: 54 }, pattern.colors.left);
  paintRect(pixels, { x: 82, y: 13, width: 8, height: 54 }, pattern.colors.right);
  return pixels;
}

function createPartialMarkerFrame(edges: readonly ('bottom' | 'left' | 'right' | 'top')[]) {
  const pixels = createFrame(false);
  if (edges.includes('top')) {
    paintRect(pixels, { x: 10, y: 5, width: 80, height: 8 }, pattern.colors.top);
  }
  if (edges.includes('bottom')) {
    paintRect(pixels, { x: 10, y: 67, width: 80, height: 8 }, pattern.colors.bottom);
  }
  if (edges.includes('left')) {
    paintRect(pixels, { x: 10, y: 13, width: 8, height: 54 }, pattern.colors.left);
  }
  if (edges.includes('right')) {
    paintRect(pixels, { x: 82, y: 13, width: 8, height: 54 }, pattern.colors.right);
  }
  return pixels;
}

function createVerifierFixture(frames: readonly Uint8ClampedArray[]) {
  let frameIndex = 0;
  const canvas = document.createElement('canvas');
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: frames[Math.min(Math.max(frameIndex - 1, 0), frames.length - 1)]!,
    })),
  };
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) =>
    tagName === 'canvas' ? canvas : originalCreateElement(tagName)
  );
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: height },
    videoWidth: { configurable: true, value: width },
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn((callback: VideoFrameRequestCallback) => {
        const presentedFrames = (frameIndex += 1);
        setTimeout(
          () =>
            callback(performance.now(), {
              expectedDisplayTime: performance.now(),
              height,
              mediaTime: presentedFrames / 30,
              presentationTime: performance.now(),
              presentedFrames,
              width,
            }),
          0
        );
        return presentedFrames;
      }),
    },
  });
  return { verify: createViewportFrameVerifier(video), video };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('finds a coherent four-edge viewport rectangle on a presented raw frame', async () => {
  const fixture = createVerifierFixture([createFrame(true)]);

  await expect(fixture.verify({ pattern, phase: 'marked' }, () => true)).resolves.toEqual({
    presentedFrames: 1,
    sourceSize: { height, width },
    viewportRect: { x: 10, y: 5, width: 80, height: 70 },
  });
});

it('requires a later pair of marker-free frames and tolerates matching page colors', async () => {
  const fixture = createVerifierFixture([
    createFrame(true),
    createFrame(false),
    createFrame(false),
  ]);

  await expect(
    fixture.verify(
      {
        afterPresentedFrames: 1,
        expectedViewportRect: { x: 10, y: 5, width: 80, height: 70 },
        pattern,
        phase: 'clean',
      },
      () => true
    )
  ).resolves.toMatchObject({ presentedFrames: 3, sourceSize: { height, width } });
  expect(fixture.video.requestVideoFrameCallback).toHaveBeenCalledTimes(3);
});

it('rejects one-edge and partial marker residue before accepting marker-free frames', async () => {
  const fixture = createVerifierFixture([
    createFrame(true),
    createPartialMarkerFrame(['top', 'bottom', 'left']),
    createPartialMarkerFrame(['right']),
    createFrame(false),
    createFrame(false),
  ]);

  await expect(
    fixture.verify(
      {
        afterPresentedFrames: 1,
        expectedViewportRect: { x: 10, y: 5, width: 80, height: 70 },
        pattern,
        phase: 'clean',
      },
      () => true
    )
  ).resolves.toMatchObject({ presentedFrames: 5 });
  expect(fixture.video.requestVideoFrameCallback).toHaveBeenCalledTimes(5);
});

it('rejects stale verification before reading pixels', async () => {
  const fixture = createVerifierFixture([createFrame(true)]);
  await expect(fixture.verify({ pattern, phase: 'marked' }, () => false)).rejects.toThrow(
    'superseded'
  );
});

it('fails closed when the browser never presents a verifiable frame', async () => {
  vi.useFakeTimers();
  const context = { drawImage: vi.fn(), getImageData: vi.fn() };
  const pendingCallbacks: VideoFrameRequestCallback[] = [];
  const cancelVideoFrameCallback = vi.fn();
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: height },
    videoWidth: { configurable: true, value: width },
    cancelVideoFrameCallback: { configurable: true, value: cancelVideoFrameCallback },
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn((callback: VideoFrameRequestCallback) => {
        pendingCallbacks.push(callback);
        return 7;
      }),
    },
  });
  const result = createViewportFrameVerifier(video)({ pattern, phase: 'marked' }, () => true);
  const assertion = expect(result).rejects.toThrow(
    'Timed out waiting for a verified marked viewport frame'
  );

  await vi.advanceTimersByTimeAsync(4_001);
  await assertion;
  expect(cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();

  pendingCallbacks[0]!(performance.now(), {
    expectedDisplayTime: performance.now(),
    height,
    mediaTime: 1,
    presentationTime: performance.now(),
    presentedFrames: 1,
    width,
  });
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
  expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
});

it('rejects construction when a readable analysis canvas is unavailable', () => {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(null);
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  expect(() => createViewportFrameVerifier(document.createElement('video'))).toThrow(
    'verification canvas is unavailable'
  );
});
