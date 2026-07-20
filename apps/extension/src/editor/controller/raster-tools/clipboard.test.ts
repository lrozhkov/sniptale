// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorRasterToolSessionState } from './types';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,copied'),
  canvasToRasterDataUrl: vi.fn(() => 'data:image/png;base64,copied'),
  clearRasterBitmap: vi.fn(),
  createInsertedImageObject: vi.fn(async () => ({ id: 'external-image' })),
  dataUrlToBlob: vi.fn(async () => new Blob(['copy'], { type: 'image/png' })),
  fabricImageFromUrl: vi.fn(),
  getRasterMaskBounds: vi.fn(() => ({ height: 2, left: 2, top: 3, width: 4 })),
  readBrowserClipboardImage: vi.fn(),
  resolveRasterOverlayObject: vi.fn(),
  writeBrowserClipboardItems: vi.fn(async () => undefined),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fabricImageFromUrl,
  },
}));

vi.mock('@sniptale/platform/browser/clipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/clipboard')>()),
  readBrowserClipboardImage: mocks.readBrowserClipboardImage,
  writeBrowserClipboardItems: mocks.writeBrowserClipboardItems,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrl,
  dataUrlToBlob: mocks.dataUrlToBlob,
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  createObjectLabel: (_type: string, index: number) => `Image ${index}`,
}));

vi.mock('../tools/insertions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/insertions')>()),
  createInsertedImageObject: mocks.createInsertedImageObject,
}));

vi.mock('../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/mutations')>()),
  clearRasterBitmap: mocks.clearRasterBitmap,
}));

vi.mock('../raster/object/lookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object/lookup')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: vi.fn(async () => createSnapshot()),
}));

vi.mock('../raster/selection/bounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/selection/bounds')>()),
  getRasterMaskBounds: mocks.getRasterMaskBounds,
}));

vi.mock('../raster/bitmap/canvas', async () => {
  const actual =
    await vi.importActual<typeof import('../raster/bitmap/canvas')>('../raster/bitmap/canvas');
  return {
    ...actual,
    canvasToRasterDataUrl: mocks.canvasToRasterDataUrl,
  };
});

import {
  copyRasterSelectionToClipboard,
  cutRasterSelectionToClipboard,
  deleteRasterSelectionPixels,
  pasteRasterClipboardImage,
} from './clipboard';

function createMaskCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 8;
  canvas.getContext('2d')?.fillRect(2, 3, 4, 2);
  return canvas;
}

function createSnapshot() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 10;
  bitmap.height = 8;
  return {
    bitmap,
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { height: 80, left: 100, top: 200, width: 100 },
  };
}

function createSession(): EditorRasterToolSessionState {
  return {
    brushDraft: null,
    clipboard: null,
    eraserDraft: null,
    gradientDraft: null,
    hoverCursor: null,
    lassoDraft: null,
    marqueeDraft: null,
    overlayListeners: new Set(),
    selection: {
      maskCanvas: createMaskCanvas(),
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    },
  };
}

function createController(session = createSession()) {
  const canvas = {
    add: vi.fn(),
    getHeight: vi.fn(() => 600),
    getWidth: vi.fn(() => 800),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  return {
    applyRasterBitmap: vi.fn(async () => undefined),
    canvas: canvas as never,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(() => 7),
    prepareObject: vi.fn(),
    rasterToolSession: session,
    source: { displayHeight: 80, displayWidth: 100, left: 10, top: 20 } as never,
    syncRuntimeState: vi.fn(),
  };
}

function registerClipboardSetup() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ClipboardItem',
      class MockClipboardItem {
        constructor(public readonly items: Record<string, Blob>) {}
      }
    );
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'image-id') });
    mocks.resolveRasterOverlayObject.mockReturnValue({ id: 'target-object' });
    mocks.fabricImageFromUrl.mockResolvedValue({
      height: 2,
      sniptaleId: null,
      sniptaleLabel: null,
      sniptaleRole: null,
      sniptaleType: null,
      set: vi.fn(),
      width: 4,
    });
    mocks.readBrowserClipboardImage.mockResolvedValue({
      blob: new Blob(['copy'], { type: 'image/png' }),
      mimeType: 'image/png',
    });
  });
}

function registerCopySelectionTest() {
  it('copies the masked raster selection to the system clipboard and keeps placement metadata', async () => {
    const controller = createController();

    await expect(copyRasterSelectionToClipboard(controller)).resolves.toBe(true);

    expect(mocks.writeBrowserClipboardItems).toHaveBeenCalledOnce();
    expect(controller.rasterToolSession.clipboard).toEqual({
      dataUrl: 'data:image/png;base64,copied',
      sceneBounds: { height: 20, left: 120, top: 230, width: 40 },
      source: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    });
  });

  it('returns false when copy has no selection or the raster target disappeared', async () => {
    const session = createSession();
    session.selection = null;
    await expect(copyRasterSelectionToClipboard(createController(session))).resolves.toBe(false);

    const staleSession = createSession();
    mocks.resolveRasterOverlayObject.mockReturnValueOnce(null);
    await expect(copyRasterSelectionToClipboard(createController(staleSession))).resolves.toBe(
      false
    );
    expect(staleSession.selection).toBeNull();
  });
}

function registerCutFailureTest() {
  it('does not clear pixels when cut cannot write the selection to the system clipboard', async () => {
    const controller = createController();
    mocks.writeBrowserClipboardItems.mockRejectedValueOnce(new Error('write failed'));

    await expect(cutRasterSelectionToClipboard(controller)).rejects.toThrow('write failed');

    expect(controller.applyRasterBitmap).not.toHaveBeenCalled();
    expect(controller.rasterToolSession.selection).not.toBeNull();
  });
}

function registerDeleteSelectionTest() {
  it('deletes the selected pixels through the raster mutation seam', async () => {
    const controller = createController();

    await expect(deleteRasterSelectionPixels(controller)).resolves.toBe(true);

    expect(mocks.clearRasterBitmap).toHaveBeenCalledWith({
      bitmap: expect.any(HTMLCanvasElement),
      maskCanvas: expect.any(HTMLCanvasElement),
    });
    expect(controller.applyRasterBitmap).toHaveBeenCalledOnce();
    expect(controller.rasterToolSession.selection).toBeNull();
  });

  it('keeps the raster selection when delete cannot apply the bitmap replacement', async () => {
    const controller = createController();
    controller.applyRasterBitmap.mockRejectedValueOnce(new Error('apply failed'));

    await expect(deleteRasterSelectionPixels(controller)).rejects.toThrow('apply failed');

    expect(mocks.clearRasterBitmap).toHaveBeenCalledOnce();
    expect(controller.rasterToolSession.selection).not.toBeNull();
  });
}

function registerPasteSelectionTest() {
  it('pastes a self-copied raster selection as a new image layer at the original scene bounds', async () => {
    const session = createSession();
    session.clipboard = {
      dataUrl: 'data:image/png;base64,copied',
      sceneBounds: { height: 20, left: 120, top: 230, width: 40 },
      source: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    };
    const controller = createController(session);

    await expect(pasteRasterClipboardImage(controller)).resolves.toBe(true);

    expect(mocks.fabricImageFromUrl).toHaveBeenCalledWith('data:image/png;base64,copied');
    expect((controller.canvas as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.rasterToolSession.selection).toBeNull();
  });

  it('pastes external clipboard images through the standard inserted-image path', async () => {
    const session = createSession();
    session.clipboard = null;
    const controller = createController(session);

    await expect(pasteRasterClipboardImage(controller)).resolves.toBe(true);

    expect(mocks.createInsertedImageObject).toHaveBeenCalledWith(
      expect.objectContaining({ dataUrl: 'data:image/png;base64,copied' })
    );
    expect((controller.canvas as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith({
      id: 'external-image',
    });
  });

  it('returns false when the system clipboard has no image item', async () => {
    mocks.readBrowserClipboardImage.mockResolvedValueOnce(null);

    await expect(pasteRasterClipboardImage(createController())).resolves.toBe(false);
  });
}

describe('editor-controller/raster-tools/clipboard', () => {
  registerClipboardSetup();
  registerCopySelectionTest();
  registerCutFailureTest();
  registerDeleteSelectionTest();
  registerPasteSelectionTest();
});
