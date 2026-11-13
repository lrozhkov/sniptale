// @vitest-environment jsdom
import { Canvas, FabricImage, Group, getEnv } from 'fabric';
import { expect, it } from 'vitest';
import type { RasterTarget } from './adapters';
import { createNativeRasterGeometry } from './coordinates';
import { createEditorRasterMetadata } from './image-state';
import { createRasterOverlay } from './overlay';
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

it.each([false, true])(
  'expands native crop preview outside the accepted group bounds (grouped=%s)',
  async (grouped) => {
    const image = new FabricImage(bitmap('red'), {
      left: 40,
      top: 40,
      width: 2,
      height: 2,
      cropX: 1,
      cropY: 1,
      scaleX: 10,
      scaleY: 10,
    });
    const canvas = new Canvas(undefined, { width: 160, height: 160, renderOnAddRemove: false });
    const group = grouped ? new Group([image], { left: 40, top: 40 }) : null;
    canvas.add(group ?? image);
    const accepted = target(image);
    const overlay = createRasterOverlay(canvas);
    const color = new Uint8ClampedArray(64);
    for (let i = 0; i < 16; i++) color.set([0, 0, 255, 255], i * 4);
    const planes = { width: 4, height: 4, color, visibility: null, key: null };
    overlay.pixels(accepted, planes, {
      planes,
      coverage: new Uint8Array(16),
      dirtyBounds: { x: 0, y: 0, width: 4, height: 4 },
      pixels: color,
    });
    overlay.crop(accepted, null);
    canvas.renderAll();
    const source = accepted.geometry.sourceToScene,
      x = Math.floor(source[4] + source[0] * 0.5),
      y = Math.floor(source[5] + source[3] * 0.5);
    expect([...canvas.getContext().getImageData(x, y, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect([...canvas.toCanvasElement().getContext('2d')!.getImageData(x, y, 1, 1).data]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(image.cropX).toBe(1);
    expect(image.width).toBe(2);
    overlay.dispose();
    await canvas.dispose();
  }
);

it('draws disposable selection and cursor chrome outside the accepted export', async () => {
  const image = new FabricImage(bitmap('red'), { left: 20, top: 20, scaleX: 10, scaleY: 10 });
  const canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = target(image),
    overlay = createRasterOverlay(canvas);
  const hasChrome = () =>
    canvas.contextTop
      .getImageData(0, 0, 100, 100)
      .data.some((value, index) => index % 4 === 3 && value > 0);
  overlay.selection(
    accepted,
    new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  );
  canvas.renderAll();
  expect(hasChrome()).toBe(true);
  expect([...canvas.toCanvasElement().getContext('2d')!.getImageData(30, 30, 1, 1).data]).toEqual([
    255, 0, 0, 255,
  ]);
  overlay.clear();
  expect(hasChrome()).toBe(false);
  overlay.cursor?.(accepted, { x: 2, y: 2 }, 2);
  canvas.renderAll();
  expect(hasChrome()).toBe(true);
  overlay.dispose();
  expect(hasChrome()).toBe(false);
  await canvas.dispose();
});
