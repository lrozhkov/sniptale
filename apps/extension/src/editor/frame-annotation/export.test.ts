import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Rect } from 'fabric';
import { createFrameAnnotationProxy } from './proxy';
import { createFabricCanvasFixture } from '../testing/fabric-canvas.test-support';
import { createDefaultRichShapeObject } from '../../features/editor/document/rich-shape';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,final'),
  dataUrlToBlob: vi.fn(async () => new Blob(['base'], { type: 'image/png' })),
  rasterize: vi.fn(),
  renderCanvas: vi.fn(() => 'data:image/png;base64,base'),
  showToast: vi.fn(),
}));

vi.mock('../controller/document/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controller/document/export')>()),
  renderEditorCanvasToDataUrl: mocks.renderCanvas,
}));
vi.mock('../../composition/frame-annotation-raster-client', () => ({
  rasterizeFrameAnnotations: mocks.rasterize,
}));
vi.mock('../../platform/media-utils/data-url', () => ({
  blobToDataUrl: mocks.blobToDataUrl,
  dataUrlToBlob: mocks.dataUrlToBlob,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.showToast }));

import { renderEditorWithFrameAnnotations } from '../controller/public-api/document/frame-annotation-export';

function createCanvas() {
  const proxy = createFrameAnnotationProxy({
    frame: { id: 'frame-1', x: 10, y: 20, width: 100, height: 80 },
    label: 'Frame 1',
    ordering: 0,
  });
  const object = new Rect({ left: 0, top: 0, width: 20, height: 20 });
  object.sniptaleId = 'ordinary-1';
  object.sniptaleType = 'shape';
  const objects = [object, proxy];
  const canvas = {
    getObjects: vi.fn(() => objects),
    requestRenderAll: vi.fn(),
  };
  return { canvas, object, proxy };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rasterize.mockResolvedValue({
    blob: new Blob(['output'], { type: 'image/png' }),
    metadata: { downscaled: false, outputHeight: 100, outputScale: 1, outputWidth: 200 },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('delegates directly when the Fabric canvas is unavailable', async () => {
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: null,
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).resolves.toBe('data:image/png;base64,base');
  expect(mocks.renderCanvas).toHaveBeenCalledWith(null, { format: 'png', quality: 100 });
});

it('renders the Fabric base without proxies and restores proxy visibility after success', async () => {
  const { canvas, proxy } = createCanvas();
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', outputSize: { width: 100, height: 50 }, quality: 100 },
    })
  ).resolves.toBe('data:image/png;base64,final');
  expect(mocks.renderCanvas).toHaveBeenCalledWith(canvas, { format: 'png', quality: 1 });
  expect(proxy.visible).toBe(true);
  expect(mocks.rasterize).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ snapshots: [expect.objectContaining({ id: 'frame-1' })] }),
      isCurrent: expect.any(Function),
    })
  );
});

it('rejects a stale frame projection even if the raster adapter returns it', async () => {
  const { canvas, proxy } = createCanvas();
  mocks.rasterize.mockImplementationOnce(async (options) => {
    proxy.sniptaleFrameAnnotationRevision = 2;
    expect(options.isCurrent()).toBe(false);
    return {
      blob: new Blob(['output'], { type: 'image/png' }),
      metadata: { downscaled: false, outputHeight: 100, outputScale: 1, outputWidth: 200 },
    };
  });
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).rejects.toThrow('Frame annotation raster result is stale');
});

it('rejects a raster result after an ordinary Fabric layer changes', async () => {
  const { canvas, object } = createCanvas();
  mocks.rasterize.mockImplementationOnce(async (options) => {
    object.set({ left: 32 });
    expect(options.isCurrent()).toBe(false);
    return {
      blob: new Blob(['output'], { type: 'image/png' }),
      metadata: { downscaled: false, outputHeight: 100, outputScale: 1, outputWidth: 200 },
    };
  });
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).rejects.toThrow('Frame annotation raster result is stale');
});

it('rejects a raster result after excluded rich-shape state changes', async () => {
  const { canvas, object } = createCanvas();
  object.sniptaleType = 'rich-shape';
  object.sniptaleRichShape = createDefaultRichShapeObject({
    id: 'rich-1',
    frame: { height: 20, left: 0, top: 0, width: 20 },
  });
  mocks.rasterize.mockImplementationOnce(async (options) => {
    object.sniptaleRichShape = {
      ...object.sniptaleRichShape!,
      frame: { height: 20, left: 12, top: 0, width: 20 },
    };
    expect(options.isCurrent()).toBe(false);
    return {
      blob: new Blob(['output'], { type: 'image/png' }),
      metadata: { downscaled: false, outputHeight: 100, outputScale: 1, outputWidth: 200 },
    };
  });
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).rejects.toThrow('Frame annotation raster result is stale');
});

it('rejects a raster result after a visible excludeFromExport object changes', async () => {
  const { canvas, object } = createCanvas();
  object.excludeFromExport = true;
  mocks.rasterize.mockImplementationOnce(async (options) => {
    object.set({ top: 48 });
    expect(options.isCurrent()).toBe(false);
    return {
      blob: new Blob(['output'], { type: 'image/png' }),
      metadata: { downscaled: false, outputHeight: 100, outputScale: 1, outputWidth: 200 },
    };
  });
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).rejects.toThrow('Frame annotation raster result is stale');
});

it('rejects a raster result when the canvas changes during final format conversion', async () => {
  const { canvas, object } = createCanvas();
  let resolveConversion: ((value: string) => void) | undefined;
  mocks.blobToDataUrl.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        resolveConversion = resolve;
      })
  );

  const result = renderEditorWithFrameAnnotations({
    canvas: createFabricCanvasFixture(canvas),
    canvasDocumentSize: { width: 200, height: 100 },
    renderOptions: { format: 'png', quality: 100 },
  });
  await vi.waitFor(() => expect(resolveConversion).toBeTypeOf('function'));
  object.set({ left: 64 });
  resolveConversion?.('data:image/png;base64,stale');

  await expect(result).rejects.toThrow('Frame annotation raster result is stale');
  expect(mocks.showToast).not.toHaveBeenCalled();
});

it('restores proxy visibility and leaves the document unchanged when base rendering fails', async () => {
  const { canvas, proxy } = createCanvas();
  mocks.renderCanvas.mockImplementationOnce(() => {
    throw new Error('base render failed');
  });
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).rejects.toThrow('base render failed');
  expect(proxy.visible).toBe(true);
  expect(mocks.rasterize).not.toHaveBeenCalled();
});

it('omits a hidden frame annotation from the DOM raster export', async () => {
  const { canvas, proxy } = createCanvas();
  proxy.visible = false;
  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: 'png', quality: 100 },
    })
  ).resolves.toBe('data:image/png;base64,base');
  expect(mocks.rasterize).not.toHaveBeenCalled();
  expect(proxy.visible).toBe(false);
});

it('surfaces optimized export as a successful warning', async () => {
  const { canvas } = createCanvas();
  mocks.rasterize.mockResolvedValueOnce({
    blob: new Blob(['output'], { type: 'image/png' }),
    metadata: { downscaled: true, outputHeight: 50, outputScale: 0.5, outputWidth: 100 },
  });
  await renderEditorWithFrameAnnotations({
    canvas: createFabricCanvasFixture(canvas),
    canvasDocumentSize: { width: 200, height: 100 },
    renderOptions: { format: 'png', quality: 100 },
  });
  expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'warning');
});

it.each([
  { format: 'jpeg' as const, mime: 'image/jpeg', quality: 80, encodedQuality: 0.8 },
  { format: 'webp' as const, mime: 'image/webp', quality: 0.5, encodedQuality: 0.5 },
])('converts the raster PNG to $format with normalized quality', async (fixture) => {
  const { canvas } = createCanvas();
  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => `data:${fixture.mime};base64,converted`);
  const outputCanvas = { getContext: vi.fn(() => ({ drawImage })), height: 0, toDataURL, width: 0 };
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'Image',
    class {
      decode = vi.fn(async () => undefined);
      naturalHeight = 100;
      naturalWidth = 200;
      src = '';
    }
  );
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:raster'), revokeObjectURL });
  vi.stubGlobal('document', { createElement: vi.fn(() => outputCanvas) });

  await expect(
    renderEditorWithFrameAnnotations({
      canvas: createFabricCanvasFixture(canvas),
      canvasDocumentSize: { width: 200, height: 100 },
      renderOptions: { format: fixture.format, quality: fixture.quality },
    })
  ).resolves.toBe(`data:${fixture.mime};base64,converted`);
  expect(outputCanvas).toMatchObject({ height: 100, width: 200 });
  expect(drawImage).toHaveBeenCalledOnce();
  expect(toDataURL).toHaveBeenCalledWith(fixture.mime, fixture.encodedQuality);
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:raster');
});
