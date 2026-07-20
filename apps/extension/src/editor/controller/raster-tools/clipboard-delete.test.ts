// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorRasterToolSessionState } from './types';

const mocks = vi.hoisted(() => ({
  clearRasterBitmap: vi.fn(),
  copyRasterSelectionToClipboard: vi.fn(async () => true),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'target-object' })),
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
  createRasterTargetSnapshot: vi.fn(async () => ({
    bitmap: document.createElement('canvas'),
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { height: 8, left: 0, top: 0, width: 10 },
  })),
}));

vi.mock('./clipboard-copy/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./clipboard-copy/controller')>()),
  copyRasterSelectionToClipboard: mocks.copyRasterSelectionToClipboard,
}));

import { cutRasterSelectionToClipboard, deleteRasterSelectionPixels } from './clipboard-delete';

function createSession(): EditorRasterToolSessionState {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 10;
  maskCanvas.height = 8;
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
      maskCanvas,
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copyRasterSelectionToClipboard.mockResolvedValue(true);
});

it('owns destructive raster selection deletion and clears selection after apply', async () => {
  const session = createSession();
  const applyRasterBitmap = vi.fn(async () => undefined);

  await expect(
    deleteRasterSelectionPixels({
      applyRasterBitmap,
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: session,
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(true);

  expect(mocks.clearRasterBitmap).toHaveBeenCalledOnce();
  expect(applyRasterBitmap).toHaveBeenCalledOnce();
  expect(session.selection).toBeNull();
});

it('skips delete when there is no active selection or target object', async () => {
  const session = createSession();
  session.selection = null;

  await expect(
    deleteRasterSelectionPixels({
      applyRasterBitmap: vi.fn(async () => undefined),
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: session,
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(false);
  expect(mocks.clearRasterBitmap).not.toHaveBeenCalled();

  const staleSession = createSession();
  mocks.resolveRasterOverlayObject.mockReturnValueOnce(null as never);
  await expect(
    deleteRasterSelectionPixels({
      applyRasterBitmap: vi.fn(async () => undefined),
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: staleSession,
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(false);
});

it('cuts only after copy succeeds', async () => {
  const session = createSession();
  mocks.copyRasterSelectionToClipboard.mockResolvedValueOnce(false);

  await expect(
    cutRasterSelectionToClipboard({
      applyRasterBitmap: vi.fn(async () => undefined),
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: session,
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(false);
  expect(mocks.clearRasterBitmap).not.toHaveBeenCalled();

  await expect(
    cutRasterSelectionToClipboard({
      applyRasterBitmap: vi.fn(async () => undefined),
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: createSession(),
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(true);
  expect(mocks.clearRasterBitmap).toHaveBeenCalledOnce();
});
