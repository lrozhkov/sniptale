// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createInsertedImageObject: vi.fn(async () => ({ id: 'external-image' })),
  fabricImageFromUrl: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fabricImageFromUrl,
  },
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  createObjectLabel: (_type: string, index: number) => `Image ${index}`,
}));

vi.mock('../tools/insertions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/insertions')>()),
  createInsertedImageObject: mocks.createInsertedImageObject,
}));

import {
  insertClipboardImageAtSceneBounds,
  insertExternalClipboardImage,
} from './clipboard-insert';

function createController() {
  const canvas = {
    add: vi.fn(),
    getHeight: vi.fn(() => 600),
    getWidth: vi.fn(() => 800),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  return {
    canvas: canvas as never,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(() => 4),
    prepareObject: vi.fn(),
    source: { displayHeight: 80, displayWidth: 100, left: 10, top: 20 } as never,
    syncRuntimeState: vi.fn(),
  };
}

function registerInsertSetup() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'image-id') });
    mocks.fabricImageFromUrl.mockResolvedValue({
      height: 10,
      sniptaleId: null,
      sniptaleLabel: null,
      sniptaleRole: null,
      sniptaleType: null,
      set: vi.fn(),
      width: 20,
    });
  });
}

function registerSelfPasteInsertionTest() {
  it('places self-copied clipboard images at their scene bounds', async () => {
    const controller = createController();

    await insertClipboardImageAtSceneBounds(controller, 'data:image/png;base64,self', {
      height: 30,
      left: 40,
      top: 50,
      width: 60,
    });

    expect(mocks.fabricImageFromUrl).toHaveBeenCalledWith('data:image/png;base64,self');
    expect(controller.prepareObject).toHaveBeenCalledOnce();
    expect((controller.canvas as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
  });
}

function registerExternalPasteInsertionTest() {
  it('uses the standard image insertion path for external clipboard images', async () => {
    const controller = createController();

    await insertExternalClipboardImage(controller, 'data:image/png;base64,external');

    expect(mocks.createInsertedImageObject).toHaveBeenCalledWith(
      expect.objectContaining({ canvasHeight: 600, canvasWidth: 800 })
    );
    expect((controller.canvas as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith({
      id: 'external-image',
    });
  });
}

function registerInsertGuardTest() {
  it('stays inert when insertion lacks a canvas or external paste lacks source metadata', async () => {
    const controller = createController();

    await insertClipboardImageAtSceneBounds(
      { ...controller, canvas: null },
      'data:image/png;base64,self',
      { height: 1, left: 0, top: 0, width: 1 }
    );
    await insertExternalClipboardImage(
      { ...controller, source: null },
      'data:image/png;base64,external'
    );

    expect(mocks.fabricImageFromUrl).not.toHaveBeenCalled();
    expect(mocks.createInsertedImageObject).not.toHaveBeenCalled();
  });
}

describe('raster clipboard image insertion', () => {
  registerInsertSetup();
  registerSelfPasteInsertionTest();
  registerExternalPasteInsertionTest();
  registerInsertGuardTest();
});
