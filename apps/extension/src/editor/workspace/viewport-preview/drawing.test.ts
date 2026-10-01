// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { startEditorViewportPreviewLoop } from './drawing';
import { EditorCanvas } from '../../controller/viewport/render-region';
import {
  getEditorEditingSurfaceSize,
  getEditorWorkspaceMargin,
} from '../../controller/viewport/editing-surface';

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

it.each([
  { documentSize: { width: 400, height: 1200 }, rect: [75, 0, 46, 138] },
  { documentSize: { width: 1600, height: 200 }, rect: [0, 56.75, 196, 24.5] },
])(
  'centers an undistorted $documentSize preview inside the navigation stage',
  ({ documentSize, rect }) => {
    const { context, previewCanvas, sourceCanvas } = createPreviewContext();
    const rendered = document.createElement('canvas');
    const toCanvasElement = vi.fn((_multiplier: number, _options: unknown) => rendered);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const stop = startEditorViewportPreviewLoop({
      canvasRef: { current: sourceCanvas },
      previewCanvasRef: { current: previewCanvas },
      previewSize: { width: 196, height: 138 },
      documentSize,
      getCanvas: () => ({ toCanvasElement }) as never,
    });
    callbacks[0]?.(1000);
    expect(context.drawImage).toHaveBeenCalledWith(rendered, ...rect);
    expect(toCanvasElement.mock.calls[0]?.[0]).toBeCloseTo(rect[2]! / documentSize.width);
    stop();
  }
);

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

it('samples only the image rectangle from an expanded editing surface', () => {
  const { context, previewCanvas, sourceCanvas } = createPreviewContext();
  const documentSize = { width: 4000, height: 3000 };
  const surfaceSize = getEditorEditingSurfaceSize(documentSize);
  const margin = getEditorWorkspaceMargin(documentSize);
  sourceCanvas.width = surfaceSize.width;
  sourceCanvas.height = surfaceSize.height;
  const callbacks: FrameRequestCallback[] = [];
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
    previewSize: { width: 100, height: 80 },
    documentSize,
  });
  callbacks[0]?.(1000);

  expect(context.drawImage).toHaveBeenCalledWith(
    sourceCanvas,
    margin,
    margin,
    documentSize.width,
    documentSize.height,
    0,
    2.5,
    100,
    75
  );
});

it('renders offscreen image pixels from Fabric instead of the clipped live canvas', () => {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 4196;
  sourceCanvas.height = 4176;
  const previewCanvas = document.createElement('canvas');
  const rendered = document.createElement('canvas');
  rendered.width = 100;
  rendered.height = 80;
  rendered.getContext('2d')!.fillStyle = '#ff0000';
  rendered.getContext('2d')!.fillRect(0, 0, 100, 80);
  const toCanvasElement = vi.fn(() => rendered);
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('devicePixelRatio', 1);
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
    previewSize: { width: 100, height: 80 },
    documentSize: { width: 100, height: 80 },
    getCanvas: () => ({ toCanvasElement }) as never,
  });
  callbacks[0]?.(1000);

  expect(toCanvasElement).toHaveBeenCalledWith(1, {
    left: 2048,
    top: 2048,
    width: 100,
    height: 80,
  });
  expect(Array.from(previewCanvas.getContext('2d')!.getImageData(50, 40, 1, 1).data)).toEqual([
    255, 0, 0, 255,
  ]);
});

it('uses the virtual canvas document render for the preview', () => {
  const { context, previewCanvas, sourceCanvas } = createPreviewContext();
  const surface = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(document.createElement('div'), document.createElement('div'));
  const rendered = document.createElement('canvas');
  const renderDocumentCanvas = vi.spyOn(canvas, 'renderDocumentCanvas').mockReturnValue(rendered);
  const callbacks: FrameRequestCallback[] = [];
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
    previewSize: { width: 100, height: 80 },
    documentSize: { width: 100, height: 80 },
    getCanvas: () => canvas,
  });
  callbacks[0]?.(1000);

  expect(renderDocumentCanvas).toHaveBeenCalledWith(1);
  expect(context.drawImage).toHaveBeenCalledWith(rendered, 0, 0, 100, 80);
});
