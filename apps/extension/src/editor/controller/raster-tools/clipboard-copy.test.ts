// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorRasterToolSessionState } from './types';

const mocks = vi.hoisted(() => ({
  canvasToRasterDataUrl: vi.fn(() => 'data:image/png;base64,copied'),
  dataUrlToBlob: vi.fn(async () => new Blob(['copy'], { type: 'image/png' })),
  getRasterMaskBounds: vi.fn(() => ({ height: 2, left: 2, top: 3, width: 4 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'target-object' })),
  writeBrowserClipboardItems: vi.fn(async () => undefined),
}));

vi.mock('@sniptale/platform/browser/clipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/clipboard')>()),
  writeBrowserClipboardItems: mocks.writeBrowserClipboardItems,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.dataUrlToBlob,
}));

vi.mock('../raster/object/lookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object/lookup')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: vi.fn(async () => {
    const bitmap = document.createElement('canvas');
    bitmap.width = 10;
    bitmap.height = 8;
    return {
      bitmap,
      reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { height: 80, left: 100, top: 200, width: 100 },
    };
  }),
}));

vi.mock('../raster/selection/bounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/selection/bounds')>()),
  getRasterMaskBounds: mocks.getRasterMaskBounds,
}));

vi.mock('../raster/bitmap/canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/bitmap/canvas')>()),
  canvasToRasterDataUrl: mocks.canvasToRasterDataUrl,
}));

import { copyRasterSelectionToClipboard } from './clipboard-copy/controller';

function createMaskCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 8;
  canvas.getContext('2d')?.fillRect(2, 3, 4, 2);
  return canvas;
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ClipboardItem',
    class MockClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    }
  );
});

it('owns masked raster selection payload creation and clipboard metadata', async () => {
  const session = createSession();

  await expect(
    copyRasterSelectionToClipboard({
      canvas: {} as never,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      rasterToolSession: session,
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).resolves.toBe(true);

  expect(mocks.writeBrowserClipboardItems).toHaveBeenCalledOnce();
  expect(session.clipboard).toEqual({
    dataUrl: 'data:image/png;base64,copied',
    sceneBounds: { height: 20, left: 120, top: 230, width: 40 },
    source: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
  });
});
