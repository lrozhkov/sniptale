// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, Rect, FabricImage, getEnv } from 'fabric';
import type { LayerRasterMutationContextController } from './context';
const control = vi.hoisted(() => ({ gate: null as Promise<void> | null, fail: false }));
vi.mock('../../layer-effects/rasterize/image-object', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../layer-effects/rasterize/image-object')>();
  return {
    ...original,
    createRasterizedEditorImage: vi.fn(
      async (options: Parameters<typeof original.createRasterizedEditorImage>[0]) => {
        if (control.gate) await control.gate;
        if (control.fail) throw new Error('controlled conversion failure');
        return original.createRasterizedEditorImage(options);
      }
    ),
  };
});
import { createRasterizedEditorImage } from '../../layer-effects/rasterize/image-object';
import { rasterizeEditorControllerLayer } from './transform';
const canvases: Canvas[] = [];
beforeEach(() =>
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => {
    const bitmap = getEnv().document.createElement('canvas');
    bitmap.width = 20;
    bitmap.height = 10;
    return new FabricImage(bitmap);
  })
);

function fixture() {
  const canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvases.push(canvas);
  const lower = new Rect({ left: 0, top: 0, width: 4, height: 4 });
  lower.sniptaleId = 'lower';
  const target = new Rect({
    left: 10,
    top: 20,
    width: 20,
    height: 10,
    strokeWidth: 0,
    originX: 'left',
    originY: 'top',
    fill: '#ff0000',
  });
  target.sniptaleId = 'vector';
  target.sniptaleType = 'shape';
  target.sniptaleLabel = 'Custom shape';
  const upper = new Rect({ left: 40, top: 40, width: 4, height: 4 });
  upper.sniptaleId = 'upper';
  canvas.add(lower, target, upper);
  canvas.setActiveObject(target);
  const controller = {
    canvas,
    source: null,
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    createLayerMutationToken: vi.fn(() => 1),
    isLayerMutationTokenCurrent: vi.fn(() => true),
  } satisfies LayerRasterMutationContextController;
  return { controller, canvas, target, lower, upper };
}
function hold() {
  let resolve!: () => void;
  control.gate = new Promise((done) => {
    resolve = done;
  });
  return resolve;
}
afterEach(async () => {
  control.gate = null;
  control.fail = false;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  await Promise.all(canvases.splice(0).map((canvas) => canvas.dispose()));
});
it('rasterizes a vector preserving identity, name, index and bounds in one history step', async () => {
  const { controller, canvas, target, lower, upper } = fixture();
  expect(await rasterizeEditorControllerLayer(controller, 'vector')).toBe(true);
  const replacement = canvas.getObjects()[1];
  expect(replacement).toBeInstanceOf(FabricImage);
  expect(replacement).toMatchObject({
    sniptaleId: 'vector',
    sniptaleLabel: 'Custom shape',
    sniptaleType: 'image',
    left: 10,
    top: 20,
    width: 20,
    height: 10,
  });
  expect(canvas.getObjects()).toEqual([lower, replacement, upper]);
  expect(canvas.getObjects()).not.toContain(target);
  expect(canvas.getActiveObject()).toBe(replacement);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});
it.each(['selection', 'name', 'geometry', 'order', 'lock', 'removed', 'token'] as const)(
  'refuses a stale vector conversion after %s changes without replacing accepted work',
  async (change) => {
    const { controller, canvas, target, upper } = fixture();
    const release = hold();
    const pending = rasterizeEditorControllerLayer(controller, 'vector');
    await vi.waitFor(() => expect(createRasterizedEditorImage).toHaveBeenCalledOnce());
    if (change === 'selection') canvas.setActiveObject(upper);
    if (change === 'name') target.sniptaleLabel = 'New name';
    if (change === 'geometry') target.set({ left: 35 });
    if (change === 'order') canvas.moveObjectTo(target, 2);
    if (change === 'lock') target.sniptaleLocked = true;
    if (change === 'removed') canvas.remove(target);
    if (change === 'token') controller.isLayerMutationTokenCurrent.mockReturnValue(false);
    release();
    expect(await pending).toBe(false);
    expect(canvas.getObjects().some((object) => object instanceof FabricImage)).toBe(false);
    expect(controller.commitHistory).not.toHaveBeenCalled();
    if (change !== 'removed') expect(canvas.getObjects()).toContain(target);
  }
);
it('preserves the vector on an image creation failure', async () => {
  const { controller, canvas, target } = fixture();
  control.fail = true;
  await expect(rasterizeEditorControllerLayer(controller, 'vector')).rejects.toThrow(
    'controlled conversion failure'
  );
  expect(canvas.getObjects()).toContain(target);
  expect(canvas.getActiveObject()).toBe(target);
  expect(controller.commitHistory).not.toHaveBeenCalled();
});
it('does not convert an unselected or locked vector', async () => {
  const { controller, canvas, target } = fixture();
  canvas.discardActiveObject();
  expect(await rasterizeEditorControllerLayer(controller, 'vector')).toBe(false);
  canvas.setActiveObject(target);
  target.sniptaleLocked = true;
  expect(await rasterizeEditorControllerLayer(controller, 'vector')).toBe(false);
  expect(createRasterizedEditorImage).not.toHaveBeenCalled();
});
