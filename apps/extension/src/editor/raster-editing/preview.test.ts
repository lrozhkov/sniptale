// @vitest-environment jsdom
import { Canvas, FabricImage, Group, Rect, getEnv } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { RasterTarget } from './adapters';
import { createNativeRasterGeometry } from './coordinates';
import { createEditorRasterMetadata } from './image-state';
import { createRasterPreview } from './preview';
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
    dirtyBounds: { x: 0, y: 0, width: 4, height: 4 },
    pixels: planes.color,
  });
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
