// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createCanvasContextStub } from './canvas-context.test.helpers';

const overlayMocks = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    cloneCanvasBitmap: vi.fn(() => {
      order.push('backdrop');
      return document.createElement('canvas');
    }),
    drawViewerBlurLayers: vi.fn(() => order.push('effect')),
    drawViewerDecorations: vi.fn(() => order.push('decoration')),
    drawViewerFocusLayer: vi.fn(() => order.push('focus')),
    projectViewerFrames: vi.fn(() => []),
  };
});

vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  cloneCanvasBitmap: overlayMocks.cloneCanvasBitmap,
  projectViewerFrames: overlayMocks.projectViewerFrames,
}));

vi.mock('./decoration', () => ({
  drawViewerDecorations: overlayMocks.drawViewerDecorations,
}));

vi.mock('./effects', () => ({
  drawViewerBlurLayers: overlayMocks.drawViewerBlurLayers,
  drawViewerFocusLayer: overlayMocks.drawViewerFocusLayer,
}));

import { composeViewerCaptureOverlays } from './composer';

const canvasContext = createCanvasContextStub({
  drawImage: vi.fn(),
  scale: vi.fn(),
});

class DataUrlImage {
  naturalHeight = 100;
  naturalWidth = 200;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

function createIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.getBoundingClientRect = () =>
    ({
      bottom: 220,
      height: 200,
      left: 10,
      right: 310,
      top: 20,
      width: 300,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
  return iframe;
}

beforeEach(() => {
  vi.clearAllMocks();
  overlayMocks.order.length = 0;
  vi.stubGlobal('Image', DataUrlImage);
  vi.stubGlobal('devicePixelRatio', 2);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,with-overlays'
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('composes focus, effect, and decoration layers in canonical order at capture DPR', async () => {
  const frame: FrameData = {
    height: 40,
    id: 'frame-1',
    width: 60,
    x: 30,
    y: 50,
  };
  const iframe = createIframe();

  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [frame],
      iframe,
      mode: 'visible',
    })
  ).resolves.toBe('data:image/png;base64,with-overlays');

  expect(canvasContext.drawImage).toHaveBeenCalledWith(expect.any(DataUrlImage), 0, 0, 200, 100);
  expect(canvasContext.scale).toHaveBeenCalledWith(2, 2);
  expect(overlayMocks.projectViewerFrames).toHaveBeenCalledWith({
    baseDataUrl: 'data:image/png;base64,base',
    frames: [frame],
    iframe,
    mode: 'visible',
  });
  expect(overlayMocks.drawViewerFocusLayer).toHaveBeenCalledWith({
    context: canvasContext,
    projections: [],
    scale: 2,
    width: 100,
    height: 50,
  });
  expect(overlayMocks.drawViewerBlurLayers).toHaveBeenCalledWith({
    context: canvasContext,
    backdrop: expect.any(HTMLCanvasElement),
    projections: [],
    scale: 2,
    width: 100,
    height: 50,
  });
  expect(overlayMocks.order).toEqual(['focus', 'backdrop', 'effect', 'decoration']);
});

it('returns the base bitmap without allocating overlay canvas state when there are no frames', async () => {
  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [],
      iframe: createIframe(),
      mode: 'visible',
    })
  ).resolves.toBe('data:image/png;base64,base');

  expect(overlayMocks.projectViewerFrames).not.toHaveBeenCalled();
  expect(canvasContext.drawImage).not.toHaveBeenCalled();
});
