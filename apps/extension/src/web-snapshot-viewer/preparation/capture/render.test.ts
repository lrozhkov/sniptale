// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderViewerFrameToDataUrl, resolveViewerCaptureMetrics } from './render';

const canvasContext = {
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  strokeRect: vi.fn(),
};

function createTextRangeRects(): DOMRectList {
  return [
    {
      bottom: 32,
      height: 20,
      left: 12,
      right: 112,
      top: 12,
      width: 100,
      x: 12,
      y: 12,
      toJSON: () => ({}),
    } as DOMRect,
  ] as unknown as DOMRectList;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    canvasContext as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,viewer'
  );
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(createTextRangeRects),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getClientRects;
});

function createIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.contentDocument?.open();
  iframe.contentDocument?.write('<!doctype html><html><body><main>Snapshot</main></body></html>');
  iframe.contentDocument?.close();
  const frameRange = (iframe.contentWindow as Window & { Range: typeof Range }).Range;
  Object.defineProperty(frameRange.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(createTextRangeRects),
  });
  Object.defineProperty(iframe, 'clientWidth', { configurable: true, value: 320 });
  Object.defineProperty(iframe, 'clientHeight', { configurable: true, value: 240 });
  return iframe;
}

it('renders the visible iframe viewport into a PNG data URL', async () => {
  const iframe = createIframe();

  await expect(renderViewerFrameToDataUrl(iframe, 'visible')).resolves.toBe(
    'data:image/png;base64,viewer'
  );

  expect(canvasContext.scale).toHaveBeenCalledWith(
    window.devicePixelRatio || 1,
    window.devicePixelRatio || 1
  );
  expect(canvasContext.fillRect).toHaveBeenCalledWith(0, 0, 320, 240);
  expect(canvasContext.fillText).toHaveBeenCalledWith('Snapshot', 12, 12, 308);
  expect(canvasContext.drawImage).not.toHaveBeenCalled();
  iframe.remove();
});

it('uses full document metrics for full snapshot capture', () => {
  const iframe = createIframe();
  const element = iframe.contentDocument!.documentElement;
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 1440 });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1200 });

  expect(resolveViewerCaptureMetrics(iframe, 'full')).toEqual({
    captureHeight: 1200,
    captureWidth: 1440,
    offsetX: 0,
    offsetY: 0,
  });
  iframe.remove();
});
