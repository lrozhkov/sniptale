// @vitest-environment jsdom
import { Canvas, FabricImage, Group, Rect, getEnv } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { RasterTarget } from './adapters';
import { createNativeRasterGeometry } from './coordinates';
import { createEditorRasterMetadata } from './image-state';
import { createRasterPreview } from './preview';
import { applyEditorRasterEffects } from '../controller/layer-effects/raster-effects';
function bitmap(color: string) {
  const value = getEnv().document.createElement('canvas');
  value.width = value.height = 4;
  const context = value.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 4, 4);
  return value;
}
function target(image: FabricImage): RasterTarget {
  return {
    identity: image,
    id: 'image',
    metadata: createEditorRasterMetadata(image.getSrc(), 4, 4),
    geometry: createNativeRasterGeometry(image, { width: 4, height: 4 }),
    permission: 'allowed',
    kind: 'image',
    label: 'image',
    revision: 'accepted',
  };
}
describe('native raster presentation isolation', () => {
  it.each([false, true])(
    'shows only the native draft and exports accepted pixels (grouped=%s)',
    async (grouped) => {
      const source = bitmap('red'),
        image = new FabricImage(source, { left: 30, top: 20, scaleX: 10, scaleY: 10 });
      const canvas = new Canvas(undefined, { width: 220, height: 160, renderOnAddRemove: false });
      const group = grouped
        ? new Group(
            [image, new Rect({ left: 90, top: 20, width: 20, height: 20, fill: 'green' })],
            { left: 40, top: 35, angle: 13 }
          )
        : null;
      canvas.add(group ?? image);
      const overlay = createRasterPreview(canvas),
        accepted = image.getSrc(),
        before = canvas.toJSON();
      const draft = new FabricImage(bitmap('blue'), {
        left: image.left,
        top: image.top,
        scaleX: image.scaleX,
        scaleY: image.scaleY,
        angle: image.angle,
        skewX: image.skewX,
        skewY: image.skewY,
      });
      const dispose = vi.fn(() => draft.dispose());
      overlay.install(target(image), { object: draft, dispose });
      const center = image.getCenterPoint();
      const sample = (context: CanvasRenderingContext2D) => [
        ...context.getImageData(Math.floor(center.x), Math.floor(center.y), 1, 1).data,
      ];
      canvas.renderAll();
      expect(sample(canvas.getContext())).toEqual([0, 0, 255, 255]);
      expect(sample(canvas.toCanvasElement().getContext('2d')!)).toEqual([255, 0, 0, 255]);
      expect(image.getSrc()).toBe(accepted);
      expect(canvas.toJSON()).toEqual(before);
      canvas.renderAll();
      expect(sample(canvas.getContext())).toEqual([0, 0, 255, 255]);
      if (group) expect(group.objectCaching).toBe(true);
      overlay.dispose();
      canvas.renderAll();
      expect(sample(canvas.getContext())).toEqual([255, 0, 0, 255]);
      expect(dispose).toHaveBeenCalledOnce();
      await canvas.dispose();
    }
  );
  it('restores ancestor caching flags after a native render throws', async () => {
    const image = new FabricImage(bitmap('red'));
    const group = new Group([image]);
    const canvas = new Canvas(undefined, { width: 20, height: 20, renderOnAddRemove: false });
    canvas.add(group);
    const overlay = createRasterPreview(canvas);
    const draft = new Rect({ width: 4, height: 4 });
    draft.render = () => {
      throw new Error('controlled display failure');
    };
    overlay.install(target(image), { object: draft, dispose: vi.fn() });
    expect(() => canvas.renderAll()).toThrow('controlled display failure');
    expect(group.objectCaching).toBe(true);
    overlay.dispose();
    expect(() => canvas.renderAll()).not.toThrow();
    await canvas.dispose();
  });
});

it('disposes a late prepared background projection after cancellation and preserves accepted display', async () => {
  const image = new FabricImage(bitmap('red'), { left: 20, top: 20, scaleX: 10, scaleY: 10 }),
    canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = { ...target(image), kind: 'background' as const };
  let resolve!: (value: { object: Rect; dispose: () => void }) => void;
  const pending = new Promise<{ object: Rect; dispose: () => void }>((done) => {
    resolve = done;
  });
  const overlay = createRasterPreview(canvas, {
    adapter: { preparePreview: () => pending, isCurrent: () => true },
  });
  const planes = {
    width: 4,
    height: 4,
    color: new Uint8ClampedArray(64).fill(255),
    visibility: null,
    key: null,
  };
  overlay.pixels(accepted, planes, {
    planes,
    coverage: new Uint8Array(16),
    strokeBounds: null,
    dirtyBounds: { x: 0, y: 0, width: 4, height: 4 },
    pixels: planes.color,
  });
  canvas.renderAll();
  overlay.clear();
  const dispose = vi.fn();
  resolve({ object: new Rect({ width: 4, height: 4 }), dispose });
  await pending;
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
  canvas.renderAll();
  expect([...canvas.getContext().getImageData(30, 30, 1, 1).data]).toEqual([255, 0, 0, 255]);
  overlay.dispose();
  await canvas.dispose();
});

it('patches the bound bitmap without reinstalling the image for each pointer update', async () => {
  const image = new FabricImage(bitmap('red'), {
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    scaleX: 10,
    scaleY: 10,
  });
  const canvas = new Canvas(undefined, { width: 80, height: 80, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = target(image);
  const planes = {
    width: 4,
    height: 4,
    color: new Uint8ClampedArray(64),
    visibility: null,
    key: null,
  };
  for (let i = 0; i < 16; i++) planes.color.set([255, 0, 0, 255], i * 4);
  const setElement = vi.spyOn(FabricImage.prototype, 'setElement');
  const overlay = createRasterPreview(canvas);
  for (const x of [0, 3])
    overlay.pixels(accepted, planes, {
      planes,
      coverage: new Uint8Array(16),
      strokeBounds: { x: 0, y: 0, width: 4, height: 1 },
      dirtyBounds: { x, y: 0, width: 1, height: 1 },
      pixels: new Uint8ClampedArray([0, 0, 255, 255]),
    });
  expect(setElement).toHaveBeenCalledOnce();
  canvas.renderAll();
  expect([...canvas.getContext().getImageData(5, 5, 1, 1).data]).toEqual([0, 0, 255, 255]);
  expect([...canvas.getContext().getImageData(35, 5, 1, 1).data]).toEqual([0, 0, 255, 255]);
  expect([...canvas.toCanvasElement().getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([
    255, 0, 0, 255,
  ]);
  overlay.dispose();
  setElement.mockRestore();
  await canvas.dispose();
});

it('refreshes correction filters once for the latest bitmap per native frame and cancels pending work', async () => {
  const image = new FabricImage(bitmap('red'), {
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    scaleX: 10,
    scaleY: 10,
  });
  applyEditorRasterEffects(image, [{ id: 'invert', enabled: true }]);
  const canvas = new Canvas(undefined, { width: 80, height: 80, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = target(image),
    overlay = createRasterPreview(canvas);
  const planes = {
    width: 4,
    height: 4,
    color: new Uint8ClampedArray(64),
    visibility: null,
    key: null,
  };
  for (let i = 0; i < 16; i++) planes.color.set([255, 0, 0, 255], i * 4);
  const filters = vi.spyOn(FabricImage.prototype, 'applyFilters');
  const update = (x: number) =>
    overlay.pixels(accepted, planes, {
      planes,
      coverage: new Uint8Array(16),
      strokeBounds: { x: 0, y: 0, width: 4, height: 1 },
      dirtyBounds: { x, y: 0, width: 1, height: 1 },
      pixels: new Uint8ClampedArray([0, 0, 255, 255]),
    });
  update(0);
  update(3);
  expect(filters).not.toHaveBeenCalled();
  canvas.renderAll();
  expect(filters).toHaveBeenCalledOnce();
  expect([...canvas.getContext().getImageData(5, 5, 1, 1).data]).toEqual([255, 255, 0, 255]);
  expect([...canvas.getContext().getImageData(35, 5, 1, 1).data]).toEqual([255, 255, 0, 255]);
  expect([...canvas.toCanvasElement().getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([
    0, 255, 255, 255,
  ]);
  update(1);
  overlay.clear();
  canvas.renderAll();
  expect(filters).toHaveBeenCalledOnce();
  overlay.dispose();
  filters.mockRestore();
  await canvas.dispose();
});

it('refuses an old background projection when a newer patch arrives before the next frame', async () => {
  const image = new FabricImage(bitmap('red'), { left: 20, top: 20 });
  const canvas = new Canvas(undefined, { width: 80, height: 80, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = { ...target(image), kind: 'background' as const };
  type Prepared = { object: Rect; dispose: () => void };
  let resolveFirst!: (value: Prepared) => void;
  let resolveSecond!: (value: Prepared) => void;
  const first = new Promise<Prepared>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<Prepared>((resolve) => {
    resolveSecond = resolve;
  });
  const prepare = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  const overlay = createRasterPreview(canvas, {
    adapter: { preparePreview: prepare, isCurrent: () => true },
  });
  const planes = {
    width: 4,
    height: 4,
    color: new Uint8ClampedArray(64).fill(255),
    visibility: null,
    key: null,
  };
  const update = () =>
    overlay.pixels(accepted, planes, {
      planes,
      coverage: new Uint8Array(16),
      strokeBounds: { x: 0, y: 0, width: 4, height: 4 },
      dirtyBounds: { x: 0, y: 0, width: 1, height: 1 },
      pixels: new Uint8ClampedArray([0, 0, 255, 255]),
    });
  update();
  canvas.renderAll();
  expect(prepare).toHaveBeenCalledOnce();
  update();
  const dispose = vi.fn();
  resolveFirst({ object: new Rect({ width: 4, height: 4 }), dispose });
  await first;
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
  canvas.renderAll();
  expect(prepare).toHaveBeenCalledTimes(2);
  const disposeSecond = vi.fn();
  resolveSecond({ object: new Rect({ width: 4, height: 4 }), dispose: disposeSecond });
  await second;
  await Promise.resolve();
  overlay.clear();
  expect(disposeSecond).toHaveBeenCalledOnce();
  overlay.dispose();
  await canvas.dispose();
});
