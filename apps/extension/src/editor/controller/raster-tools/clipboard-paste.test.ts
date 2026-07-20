// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorRasterToolSessionState } from './types';
import { MAX_EDITOR_RASTER_IMAGE_FILE_BYTES } from '../../document/file-actions/raster-intake';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,copied'),
  insertClipboardImageAtSceneBounds: vi.fn(async () => undefined),
  insertExternalClipboardImage: vi.fn(async () => undefined),
  readBrowserClipboardImage: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/clipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/clipboard')>()),
  readBrowserClipboardImage: mocks.readBrowserClipboardImage,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrl,
}));

vi.mock('./clipboard-insert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./clipboard-insert')>()),
  insertClipboardImageAtSceneBounds: mocks.insertClipboardImageAtSceneBounds,
  insertExternalClipboardImage: mocks.insertExternalClipboardImage,
}));

import { pasteRasterClipboardImage } from './clipboard-paste';

function createSession(): EditorRasterToolSessionState {
  return {
    brushDraft: null,
    clipboard: {
      dataUrl: 'data:image/png;base64,copied',
      sceneBounds: { height: 20, left: 120, top: 230, width: 40 },
      source: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    },
    eraserDraft: null,
    gradientDraft: null,
    hoverCursor: null,
    lassoDraft: null,
    marqueeDraft: null,
    overlayListeners: new Set(),
    selection: {
      maskCanvas: document.createElement('canvas'),
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    },
  };
}

function createController(session: EditorRasterToolSessionState = createSession()) {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(),
    prepareObject: vi.fn(),
    rasterToolSession: session,
    source: null,
    syncRuntimeState: vi.fn(),
  };
}

function createSizedBlob(size: number, type: string): Blob {
  const blob = new Blob(['image'], { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readBrowserClipboardImage.mockResolvedValue({
    blob: new Blob(['copy'], { type: 'image/png' }),
    mimeType: 'image/png',
  });
});

it('owns paste routing for session clipboard matches and external images', async () => {
  const session = createSession();
  const controller = createController(session);

  await expect(pasteRasterClipboardImage(controller)).resolves.toBe(true);
  expect(mocks.insertClipboardImageAtSceneBounds).toHaveBeenCalledWith(
    controller,
    'data:image/png;base64,copied',
    { height: 20, left: 120, top: 230, width: 40 }
  );
  expect(session.selection).toBeNull();

  session.clipboard = null;
  await expect(pasteRasterClipboardImage(controller)).resolves.toBe(true);
  expect(mocks.insertExternalClipboardImage).toHaveBeenCalledWith(
    controller,
    'data:image/png;base64,copied'
  );
});

it('rejects oversized external clipboard images before blob read or insertion', async () => {
  mocks.readBrowserClipboardImage.mockResolvedValueOnce({
    blob: createSizedBlob(MAX_EDITOR_RASTER_IMAGE_FILE_BYTES + 1, 'image/png'),
    mimeType: 'image/png',
  });

  await expect(pasteRasterClipboardImage(createController())).rejects.toThrow(
    'Invalid editor raster image file'
  );

  expect(mocks.blobToDataUrl).not.toHaveBeenCalled();
  expect(mocks.insertClipboardImageAtSceneBounds).not.toHaveBeenCalled();
  expect(mocks.insertExternalClipboardImage).not.toHaveBeenCalled();
});

it('rejects invalid external clipboard image MIME types before blob read or insertion', async () => {
  mocks.readBrowserClipboardImage.mockResolvedValueOnce({
    blob: createSizedBlob(128, 'image/svg+xml'),
    mimeType: 'image/svg+xml',
  });

  await expect(pasteRasterClipboardImage(createController())).rejects.toThrow(
    'Invalid editor raster image file'
  );

  expect(mocks.blobToDataUrl).not.toHaveBeenCalled();
  expect(mocks.insertClipboardImageAtSceneBounds).not.toHaveBeenCalled();
  expect(mocks.insertExternalClipboardImage).not.toHaveBeenCalled();
});

it('rejects parameterized SVG clipboard MIME types before blob read or insertion', async () => {
  mocks.readBrowserClipboardImage.mockResolvedValueOnce({
    blob: createSizedBlob(128, 'image/svg+xml;charset=utf-8'),
    mimeType: 'image/svg+xml;charset=utf-8',
  });

  await expect(pasteRasterClipboardImage(createController())).rejects.toThrow(
    'Invalid editor raster image file'
  );

  expect(mocks.blobToDataUrl).not.toHaveBeenCalled();
  expect(mocks.insertClipboardImageAtSceneBounds).not.toHaveBeenCalled();
  expect(mocks.insertExternalClipboardImage).not.toHaveBeenCalled();
});

it('rejects clipboard images when advertised MIME does not match an unsafe blob type', async () => {
  mocks.readBrowserClipboardImage.mockResolvedValueOnce({
    blob: createSizedBlob(128, 'image/svg+xml;charset=utf-8'),
    mimeType: 'image/png',
  });

  await expect(pasteRasterClipboardImage(createController())).rejects.toThrow(
    'Invalid editor raster image file'
  );

  expect(mocks.blobToDataUrl).not.toHaveBeenCalled();
  expect(mocks.insertClipboardImageAtSceneBounds).not.toHaveBeenCalled();
  expect(mocks.insertExternalClipboardImage).not.toHaveBeenCalled();
});
