// @vitest-environment jsdom
import { Canvas, FabricImage, Group, getEnv } from 'fabric';
import { expect, it, vi } from 'vitest';
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
      strokeBounds: null,
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
  overlay.cursor?.(accepted, { x: 2, y: 2 }, 2);
  overlay.hideCursor?.();
  canvas.renderAll();
  expect(hasChrome()).toBe(true);
  overlay.clear();
  expect(hasChrome()).toBe(false);
  overlay.cursor?.(accepted, { x: 2, y: 2 }, 2);
  canvas.renderAll();
  expect(hasChrome()).toBe(true);
  overlay.dispose();
  expect(hasChrome()).toBe(false);
  await canvas.dispose();
});

it('draws continuous black and white dashes and leaves an in-progress lasso open', async () => {
  const image = new FabricImage(bitmap('red'), { left: 20, top: 20, scaleX: 10, scaleY: 10 });
  const canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvas.add(image);
  const accepted = target(image),
    overlay = createRasterOverlay(canvas);
  try {
    overlay.selection(accepted, new Uint8Array(16).fill(255));
    canvas.renderAll();
    const edge = canvas.contextTop.getImageData(23, 19, 30, 2).data;
    let dark = false,
      light = false;
    for (let i = 0; i < edge.length; i += 4)
      if (edge[i + 3]) {
        if (edge[i]! < 80) dark = true;
        if (edge[i]! > 140) light = true;
      }
    expect({ dark, light }).toEqual({ dark: true, light: true });
    const mask = new Uint8Array(16);
    mask[12] = 255;
    overlay.selection(accepted, mask);
    overlay.draftSelection?.(
      accepted,
      [
        { x: 0.5, y: 0.5 },
        { x: 3.5, y: 0.5 },
        { x: 3.5, y: 3.5 },
      ],
      'lasso'
    );
    canvas.renderAll();
    const chromeAt = (x: number, y: number) => {
      const m = accepted.geometry.sourceToScene;
      const px = Math.floor(m[0] * x + m[2] * y + m[4]);
      const py = Math.floor(m[1] * x + m[3] * y + m[5]);
      return canvas.contextTop
        .getImageData(px - 1, py - 1, 3, 3)
        .data.some((value, index) => index % 4 === 3 && value > 0);
    };
    expect(chromeAt(0, 3.5)).toBe(true);
    expect(chromeAt(2, 2)).toBe(false);
    expect(chromeAt(2.5, 0.5)).toBe(true);
  } finally {
    overlay.dispose();
    await canvas.dispose();
  }
});

it('updates the raster circle on its overlay without scheduling a scene render', async () => {
  const image = new FabricImage(bitmap('white'), { left: 20, top: 20, scaleX: 10, scaleY: 10 });
  const canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvas.add(image);
  const overlay = createRasterOverlay(canvas);
  const accepted = target(image);
  const render = vi.spyOn(canvas, 'requestRenderAll');
  render.mockClear();
  overlay.cursor?.(accepted, { x: 2, y: 2 }, 2);
  overlay.cursor?.(accepted, { x: 2.1, y: 2 }, 2);
  overlay.hideCursor?.();
  expect(render).not.toHaveBeenCalled();
  overlay.dispose();
  render.mockRestore();
  await canvas.dispose();
});
