// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas, FabricImage, Rect, type FabricObject } from 'fabric';
import { applyImageEditorResult, canUpdateImageResult, isImageApplyResultPresent } from './apply';
import { captureImageEditorSnapshot } from './snapshot';
import type { ImageApplyController } from './types';

const create = vi.hoisted(() => vi.fn());
vi.mock('../layer-effects/rasterize/image-object', () => ({ createRasterizedEditorImage: create }));
vi.mock('../layer-effects/rasterize/capture', () => ({
  captureEditorRaster: async () => ({ dataUrl: png, width: 2, height: 3 }),
}));
vi.mock('fabric', async (original) => {
  const actual = await original<typeof import('fabric')>();
  class FakeCanvas {
    objects: FabricObject[] = [];
    active: FabricObject | undefined;
    add(...objects: FabricObject[]) {
      this.objects.push(...objects);
    }
    remove(...objects: FabricObject[]) {
      this.objects = this.objects.filter((object) => !objects.includes(object));
    }
    getObjects() {
      return this.objects;
    }
    getActiveObjects() {
      return this.active
        ? [this.active]
        : this.objects.filter((object) => object.sniptaleRole === 'annotation');
    }
    getActiveObject() {
      return this.active;
    }
    setActiveObject(object: FabricObject) {
      this.active = object;
    }
    discardActiveObject() {
      this.active = undefined;
    }
    moveObjectTo(object: FabricObject, index: number) {
      this.remove(object);
      this.objects.splice(index, 0, object);
    }
    requestRenderAll() {}
  }
  return { ...actual, Canvas: FakeCanvas };
});
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
function image() {
  const element = document.createElement('img');
  element.width = 2;
  element.height = 3;
  return new FabricImage(element, { originX: 'left', originY: 'top' });
}
function setup() {
  const canvas = new Canvas();
  const source = image();
  source.sniptaleType = 'source-image';
  source.sniptaleRole = 'source';
  source.sniptaleId = 'source';
  const a = new Rect({
    originX: 'left',
    originY: 'top',
    left: 10,
    top: 20,
    width: 2,
    height: 3,
    strokeWidth: 0,
  });
  a.sniptaleId = 'a';
  a.sniptaleRole = 'annotation';
  a.sniptaleType = 'shape';
  const b = new Rect({
    originX: 'left',
    originY: 'top',
    left: 10,
    top: 20,
    width: 2,
    height: 3,
    strokeWidth: 0,
  });
  b.sniptaleId = 'b';
  b.sniptaleRole = 'annotation';
  b.sniptaleType = 'shape';
  canvas.add(source, a, b);
  const controller: ImageApplyController = {
    canvas,
    source: {
      id: 'source',
      dataUrl: png,
      name: 'Source',
      intrinsicWidth: 2,
      intrinsicHeight: 3,
      left: 0,
      top: 0,
      displayWidth: 2,
      displayHeight: 3,
      visible: true,
      locked: false,
    },
    originalDocument: null,
    canvasDocumentSize: { width: 100, height: 100 },
    prepareObject: vi.fn(),
    setSource: (next) => {
      controller.source = next;
    },
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: (run) => run(),
    ensureBrowserFrameOnTop: vi.fn(),
  };
  return { canvas, source, a, b, controller };
}
beforeEach(() => {
  create.mockReset();
  create.mockImplementation(async (options) => {
    const result = image();
    result.set({ left: options.left, top: options.top });
    result.sniptaleId = options.id;
    result.sniptaleType = 'image';
    result.sniptaleRole = 'annotation';
    return result;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local image Apply transaction', () => {
  it('recognizes a rehydrated accepted image for dedup without granting Update authority', async () => {
    const { controller, canvas } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'new-image' });
    const receipt = await applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'add',
      name: 'AI',
      fit: false,
    });
    expect(isImageApplyResultPresent(controller, receipt)).toBe(true);
    const restored = image();
    if (!receipt.objectId) throw new Error('Missing accepted image ID');
    restored.sniptaleId = receipt.objectId;
    restored.sniptaleType = 'image';
    restored.sniptaleRole = 'annotation';
    canvas.remove(receipt.object);
    canvas.add(restored);
    expect(canUpdateImageResult(controller, receipt)).toBe(false);
    expect(isImageApplyResultPresent(controller, receipt)).toBe(true);
    await expect(
      applyImageEditorResult({
        controller: () => controller,
        snapshot,
        raster: { dataUrl: png, width: 2, height: 3 },
        mode: 'update',
        previous: receipt,
        name: 'AI',
        fit: false,
      })
    ).rejects.toThrow('changed-result');
    expect(isImageApplyResultPresent(controller, { ...receipt, sourceDataUrl: 'foreign' })).toBe(
      false
    );
    restored.set({ left: 1 });
    expect(isImageApplyResultPresent(controller, receipt)).toBe(false);
    canvas.remove(restored);
    expect(isImageApplyResultPresent(controller, receipt)).toBe(false);
    expect(controller.commitHistory).toHaveBeenCalledOnce();
  });
  it('hides original selected layers and inserts one raster with one history commit', async () => {
    const { controller, canvas, a, b, source } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    const receipt = await applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'replace',
      name: 'AI',
      fit: false,
    });
    expect(canvas.getObjects()).toEqual([source, a, b, receipt.object]);
    expect(a.visible).toBe(false);
    expect(b.visible).toBe(false);
    expect(receipt.object.left).toBe(10);
    expect(receipt.object.top).toBe(20);
    expect(controller.commitHistory).toHaveBeenCalledTimes(1);
    expect(canUpdateImageResult(controller, receipt)).toBe(true);
  });
  it('replaces source bytes in the unique source object and retains overlays and geometry', async () => {
    const { controller, canvas, a, b, source } = setup();
    source.set({ left: 12, top: 24, scaleX: 2, scaleY: 2 });
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'source' });
    const receipt = await applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'replace',
      name: 'AI',
      fit: false,
    });
    expect(canvas.getObjects()).toEqual([source, a, b]);
    expect(receipt.object).toBe(source);
    expect(source).toMatchObject({ left: 12, top: 24, scaleX: 2, scaleY: 2 });
    expect(controller.commitHistory).toHaveBeenCalledTimes(1);
  });
  it('preserves native new-image pixels and blocks Update after manual result changes', async () => {
    const { controller } = setup();
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'new-image' });
    const receipt = await applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'add',
      name: 'AI',
      fit: false,
    });
    expect(receipt.object).toMatchObject({ width: 2, height: 3, scaleX: 1, scaleY: 1 });
    receipt.object.set({ left: 50 });
    expect(canUpdateImageResult(controller, receipt)).toBe(false);
    await expect(
      applyImageEditorResult({
        controller: () => controller,
        snapshot,
        raster: { dataUrl: png, width: 2, height: 3 },
        mode: 'update',
        previous: receipt,
        name: 'AI',
        fit: false,
      })
    ).rejects.toThrow('changed-result');
    expect(controller.commitHistory).toHaveBeenCalledTimes(1);
  });
  it('rechecks source identity after asynchronous decode without changing the document', async () => {
    const { controller, canvas, a } = setup();
    const before = [...canvas.getObjects()];
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    create.mockImplementation(async () => {
      a.set({ left: 99 });
      return image();
    });
    await expect(
      applyImageEditorResult({
        controller: () => controller,
        snapshot,
        raster: { dataUrl: png, width: 2, height: 3 },
        mode: 'replace',
        name: 'AI',
        fit: false,
      })
    ).rejects.toThrow('stale-source');
    expect(canvas.getObjects()).toEqual(before);
    expect(a.visible).toBe(true);
    expect(controller.commitHistory).not.toHaveBeenCalled();
  });
  it('restores original objects and visibility if the document commit fails', async () => {
    const { controller, canvas, a, b } = setup();
    const before = [...canvas.getObjects()];
    const snapshot = await captureImageEditorSnapshot(controller, { intention: 'layers' });
    vi.mocked(controller.commitHistory).mockImplementation(() => {
      throw new Error('save-failed');
    });
    await expect(
      applyImageEditorResult({
        controller: () => controller,
        snapshot,
        raster: { dataUrl: png, width: 2, height: 3 },
        mode: 'replace',
        name: 'AI',
        fit: false,
      })
    ).rejects.toThrow('save-failed');
    expect(canvas.getObjects()).toEqual(before);
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(true);
  });
});

it('requires explicit fit for changed output size and refuses transparent region overlays', async () => {
  const { controller } = setup();
  const snapshot = await captureImageEditorSnapshot(controller, {
    intention: 'region',
    region: { left: 10, top: 20, width: 2, height: 3 },
    context: 'region',
  });
  const drawImage = vi.fn();
  const close = vi.fn();
  const pixels = new Uint8ClampedArray(24).fill(255);
  pixels[3] = 0;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2, height: 3, close }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(png);
  await expect(
    applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'add',
      name: 'AI',
      fit: false,
    })
  ).rejects.toThrow('transparent-region');
  expect(close).toHaveBeenCalledOnce();
  expect(controller.commitHistory).not.toHaveBeenCalled();
  pixels.fill(255);
  const receipt = await applyImageEditorResult({
    controller: () => controller,
    snapshot,
    raster: { dataUrl: png, width: 2, height: 3 },
    mode: 'add',
    name: 'AI',
    fit: false,
  });
  expect(receipt.object).toMatchObject({ left: 10, top: 20 });
  expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 2, 3, 0, 0, 2, 3);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('updates a previous raster once and refuses a late Apply after document replacement', async () => {
  const { controller, canvas } = setup();
  const snapshot = await captureImageEditorSnapshot(controller, { intention: 'new-image' });
  const first = await applyImageEditorResult({
    controller: () => controller,
    snapshot,
    raster: { dataUrl: png, width: 2, height: 3 },
    mode: 'add',
    name: 'AI',
    fit: false,
  });
  const second = await applyImageEditorResult({
    controller: () => controller,
    snapshot,
    raster: { dataUrl: png, width: 2, height: 3 },
    mode: 'update',
    previous: first,
    name: 'AI 2',
    fit: false,
  });
  expect(canvas.getObjects()).not.toContain(first.object);
  expect(canvas.getObjects()).toContain(second.object);
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
  create.mockImplementation(async () => {
    controller.canvas = new Canvas();
    return image();
  });
  await expect(
    applyImageEditorResult({
      controller: () => controller,
      snapshot,
      raster: { dataUrl: png, width: 2, height: 3 },
      mode: 'add',
      name: 'AI',
      fit: false,
    })
  ).rejects.toThrow('stale-document');
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
});

it('places a generated raster proportionally inside a differently shaped area without resampling it', async () => {
  const { controller } = setup();
  const snapshot = await captureImageEditorSnapshot(controller, {
    intention: 'region',
    region: { left: 10, top: 20, width: 20, height: 40 },
    context: 'region',
  });
  const receipt = await applyImageEditorResult({
    controller: () => controller,
    snapshot,
    raster: { dataUrl: png, width: 2, height: 3 },
    mode: 'add',
    name: 'AI',
    fit: true,
  });
  expect(create.mock.calls[0]?.[0].dataUrl).toBe(png);
  expect(receipt.object).toMatchObject({ left: 10, top: 25, scaleX: 10, scaleY: 10 });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});
