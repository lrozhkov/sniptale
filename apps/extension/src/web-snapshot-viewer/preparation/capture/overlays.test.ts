// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { composeViewerCaptureOverlays } from './overlays';
import type { FrameData } from '../../../features/highlighter/contracts';

const canvasContext: Partial<CanvasRenderingContext2D> = {
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  strokeRect: vi.fn(),
};

class DataUrlImage {
  naturalHeight = 100;
  naturalWidth = 200;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Image', DataUrlImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    canvasContext as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,with-overlays'
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

it('draws current preparation frame overlays over the viewer capture data URL', async () => {
  const frame: FrameData = {
    height: 40,
    id: 'frame-1',
    width: 60,
    x: 30,
    y: 50,
  };

  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [frame],
      iframe: createIframe(),
      mode: 'visible',
    })
  ).resolves.toBe('data:image/png;base64,with-overlays');

  expect(canvasContext.drawImage).toHaveBeenCalledWith(expect.any(DataUrlImage), 0, 0, 200, 100);
  expect(canvasContext.strokeRect).toHaveBeenCalledWith(20, 30, 60, 40);
});
