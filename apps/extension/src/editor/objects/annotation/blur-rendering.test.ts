// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { attachBlurRenderer, refreshBlurImage, type BlurRuntimeObject } from './blur-rendering';

function createObject(): BlurRuntimeObject {
  return {
    _render: vi.fn(),
    height: 40,
    left: 10,
    canvas: {
      calcViewportBoundaries: vi.fn(),
      enableRetinaScaling: false,
      getObjects: vi.fn(() => []),
      height: 180,
      renderCanvas: vi.fn(),
      requestRenderAll: vi.fn(),
      skipControlsDrawing: false,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      width: 320,
    } as never,
    sniptaleBlurSourceData: 'data:image/png;base64,asset',
    sniptaleBlurSourceHeight: 100,
    sniptaleBlurSourceLeft: 0,
    sniptaleBlurSourceTop: 0,
    sniptaleBlurSourceWidth: 100,
    top: 20,
    width: 60,
  } as never;
}

function installCanvasElementMock(backdropContext: CanvasRenderingContext2D) {
  const originalCreateElement = document.createElement.bind(document);
  return vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => backdropContext),
        height: 0,
        width: 0,
      } as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
}

function removePersistedBlurSourceMetadata(object: BlurRuntimeObject) {
  delete object.sniptaleBlurSourceData;
  delete object.sniptaleBlurSourceHeight;
  delete object.sniptaleBlurSourceLeft;
  delete object.sniptaleBlurSourceTop;
  delete object.sniptaleBlurSourceWidth;
}

function bindBlurToBackdropScene(
  object: BlurRuntimeObject,
  lowerObject: Record<string, unknown>,
  renderCanvas: ReturnType<typeof vi.fn>
) {
  object.canvas = {
    calcViewportBoundaries: vi.fn(),
    enableRetinaScaling: false,
    getObjects: vi.fn(() => [lowerObject, object, { sniptaleId: 'upper-layer' }]),
    height: 180,
    renderCanvas,
    requestRenderAll: vi.fn(),
    skipControlsDrawing: false,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    width: 320,
  } as never;
}

function renderGaussianBlurObject(object: BlurRuntimeObject) {
  attachBlurRenderer(object, () => ({ amount: 8, blurType: 'gaussian', showBorder: false }));
  refreshBlurImage(object, { amount: 8, blurType: 'gaussian', showBorder: false });
  object._render({
    beginPath: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('blur rendering solid branches', () => {
  it('attaches the blur renderer only once and renders the solid fill branch', () => {
    const object = createObject();
    const ctx = {
      beginPath: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      rect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    attachBlurRenderer(object, () => ({ amount: 12, blurType: 'solid', showBorder: false }));
    const firstRender = object._render;
    attachBlurRenderer(object, () => ({ amount: 12, blurType: 'solid', showBorder: false }));

    expect(object._render).toBe(firstRender);
    object._render(ctx);

    expect(ctx.save as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(ctx.clip as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    expect(ctx.fillRect as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
  });

  it('clears the cached image for solid blur settings and requests a rerender', () => {
    const object = createObject();

    refreshBlurImage(object, { amount: 10, blurType: 'solid', showBorder: false });

    expect(object.canvas?.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('requests a rerender for live blur branches without depending on persisted source metadata', () => {
    const object = createObject();
    delete object.sniptaleBlurSourceData;

    refreshBlurImage(object, { amount: 6, blurType: 'distortion', showBorder: false });

    expect(object.canvas?.requestRenderAll).toHaveBeenCalledOnce();
  });
});

describe('blur rendering backdrop branches', () => {
  it('renders gaussian blur from the lower composited scene instead of persisted source metadata', () => {
    const lowerObject = { sniptaleId: 'lower-layer' };
    const object = createObject();
    removePersistedBlurSourceMetadata(object);

    const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const createElementSpy = installCanvasElementMock(backdropContext);
    const renderCanvas = vi.fn();
    bindBlurToBackdropScene(object, lowerObject, renderCanvas);
    renderGaussianBlurObject(object);

    expect(createElementSpy).toHaveBeenCalledWith('canvas');
    expect(renderCanvas).toHaveBeenCalledWith(backdropContext, [lowerObject]);
  });
});
