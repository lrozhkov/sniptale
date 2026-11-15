// @vitest-environment jsdom
import { Canvas, FabricImage, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { serializeCanvasObjects, serializeEditorCanvasObject } from '../serialization';
import { loadEditorCanvasWithSourceReuse } from './reuse-source';

function fixture() {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const bitmap = document.createElement('canvas');
  bitmap.width = 2;
  bitmap.height = 2;
  const source = new FabricImage(bitmap, { width: 2, height: 2 });
  source.sniptaleId = 'source-image-layer';
  source.sniptaleType = 'source-image';
  source.sniptaleRole = 'source';
  const before = new Rect({ width: 1, height: 1 });
  before.sniptaleId = 'before';
  before.sniptaleRole = 'annotation';
  const after = new Rect({ width: 1, height: 1 });
  after.sniptaleId = 'after';
  after.sniptaleRole = 'annotation';
  canvas.add(before, source, after);
  return { canvas, source, bitmap, before, after };
}

it('preserves source bitmap identity and its exact position among restored layers', async () => {
  const { canvas, source, bitmap } = fixture();
  const input = serializeCanvasObjects(canvas);
  const decode = vi
    .spyOn(FabricImage, 'fromObject')
    .mockRejectedValue(new Error('unexpected decode'));
  try {
    await loadEditorCanvasWithSourceReuse(canvas, input, true);
    expect(decode).not.toHaveBeenCalled();
    expect(canvas.getObjects().map((object) => object.sniptaleId)).toEqual([
      'before',
      'source-image-layer',
      'after',
    ]);
    expect(canvas.getObjects()[1]).toBe(source);
    expect(source.getElement()).toBe(bitmap);
  } finally {
    decode.mockRestore();
    canvas.destroy();
  }
});

it.each([
  { name: 'ordinary open', preserve: false, patch: {} },
  { name: 'changed source position', preserve: true, patch: { left: 40 } },
  { name: 'changed source style', preserve: true, patch: { opacity: 0.5 } },
  { name: 'changed source bytes', preserve: true, patch: { src: 'data:image/png;base64,QkJC' } },
])('uses normal hydration for $name', async ({ preserve, patch }) => {
  const { canvas, source } = fixture();
  const serialized = serializeEditorCanvasObject(source);
  delete serialized.clipPath;
  const input = JSON.stringify({ objects: [{ ...serialized, ...patch }] });
  const load = vi.spyOn(canvas, 'loadFromJSON').mockResolvedValue(canvas);
  try {
    await loadEditorCanvasWithSourceReuse(canvas, input, preserve);
    expect(load).toHaveBeenCalledExactlyOnceWith(input);
  } finally {
    load.mockRestore();
    canvas.destroy();
  }
});

it('preserves the existing source and scene when another object cannot be hydrated', async () => {
  const { canvas, source, before, after } = fixture();
  canvas.renderOnAddRemove = true;
  const input = serializeCanvasObjects(canvas);
  const load = vi.spyOn(Rect, 'fromObject').mockRejectedValue(new Error('object unavailable'));
  try {
    await expect(loadEditorCanvasWithSourceReuse(canvas, input, true)).rejects.toThrow(
      'object unavailable'
    );
    expect(canvas.getObjects()).toEqual([before, source, after]);
    expect(source.canvas).toBe(canvas);
    expect(canvas.renderOnAddRemove).toBe(true);
  } finally {
    load.mockRestore();
    canvas.destroy();
  }
});
