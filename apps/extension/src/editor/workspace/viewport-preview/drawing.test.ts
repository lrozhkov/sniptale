// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { startEditorViewportPreviewLoop } from './drawing';

function createPreviewContext() {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    setTransform: vi.fn(),
  };
  const previewCanvas = document.createElement('canvas');
  previewCanvas.getContext = vi.fn(() => context) as never;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 640;
  sourceCanvas.height = 320;

  return { context, previewCanvas, sourceCanvas };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('sizes the preview canvas, draws frames, and cancels the loop on cleanup', () => {
  const { context, previewCanvas, sourceCanvas } = createPreviewContext();
  const callbacks: FrameRequestCallback[] = [];
  const cancelAnimationFrameMock = vi.fn();

  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

  const stop = startEditorViewportPreviewLoop({
    canvasRef: { current: sourceCanvas },
    previewCanvasRef: { current: previewCanvas },
    previewSize: { height: 45, width: 90 },
  });

  callbacks[0]?.(1000);

  expect(previewCanvas.width).toBe(180);
  expect(previewCanvas.height).toBe(90);
  expect(previewCanvas.style.width).toBe('90px');
  expect(previewCanvas.style.height).toBe('45px');
  expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 90, 45);
  expect(context.drawImage).toHaveBeenCalledOnce();

  stop();
  expect(cancelAnimationFrameMock).toHaveBeenCalledWith(2);
});

it('skips drawing when the source canvas is not drawable or context is missing', () => {
  const { context, previewCanvas, sourceCanvas } = createPreviewContext();
  const callbacks: FrameRequestCallback[] = [];

  sourceCanvas.width = 0;
  previewCanvas.getContext = vi.fn(() => context) as never;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  startEditorViewportPreviewLoop({
    canvasRef: { current: sourceCanvas },
    previewCanvasRef: { current: previewCanvas },
    previewSize: { height: 45, width: 90 },
  });
  callbacks[0]?.(1000);

  expect(context.clearRect).toHaveBeenCalledOnce();
  expect(context.drawImage).not.toHaveBeenCalled();

  previewCanvas.getContext = vi.fn(() => null) as never;
  startEditorViewportPreviewLoop({
    canvasRef: { current: document.createElement('canvas') },
    previewCanvasRef: { current: previewCanvas },
    previewSize: { height: 45, width: 90 },
  });
  callbacks[1]?.(2000);

  expect(context.drawImage).not.toHaveBeenCalled();
});
