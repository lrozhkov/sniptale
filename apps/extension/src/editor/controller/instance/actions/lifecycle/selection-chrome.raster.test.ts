// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { FabricImage } from 'fabric';
import { EditorCanvas } from '../../../../document/canvas-surface/render-region';
import { disposeEditorSelectionChrome, mountEditorSelectionChrome } from './selection-chrome';

const canvases: EditorCanvas[] = [];
afterEach(async () => {
  for (const canvas of canvases.splice(0)) await canvas.dispose();
});

function createRasterSelectionCanvas() {
  const source = document.createElement('canvas');
  source.width = source.height = 300;
  const image = new FabricImage(source, { left: 40, top: 40 });
  image.sniptaleType = 'image';
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 800,
    height: 600,
    preserveObjectStacking: true,
    selectionFullyContained: true,
  });
  canvas.add(image);
  canvases.push(canvas);
  return { canvas, image };
}

it('keeps a pending raster click preview through native release without selecting on press', () => {
  const { canvas, image } = createRasterSelectionCanvas();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  expect(canvas.getActiveObjects()).toEqual([]);
  expect(canvas.getSelectionPreviewObjects()).toEqual([image]);
  const releasePreviews: unknown[] = [];
  canvas.on('mouse:up', () => releasePreviews.push(canvas.getSelectionPreviewObjects()));
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70 }));
  expect(releasePreviews).toEqual([[image]]);
  expect(canvas.getActiveObject()).toBe(image);
  expect(canvas.getSelectionPreviewObjects()).toEqual([]);
});

it.each(['cancel', 'lock', 'delete'] as const)(
  'does not retain a pending raster preview after %s',
  (change) => {
    const { canvas, image } = createRasterSelectionCanvas();
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
    expect(canvas.getSelectionPreviewObjects()).toEqual([image]);
    if (change === 'cancel') canvas.cancelSelectionMarquee();
    else if (change === 'lock') image.sniptaleLocked = true;
    else canvas.remove(image);
    expect(canvas.getSelectionPreviewObjects()).toEqual([]);
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70 }));
    expect(canvas.getActiveObjects()).toEqual([]);
    expect(canvas.getSelectionPreviewObjects()).toEqual([]);
  }
);

it('keeps the raster hover border during press and publishes selected handles before the next frame', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const source = document.createElement('canvas');
  source.width = source.height = 100;
  const image = new FabricImage(source, { left: 40, top: 40 });
  image.sniptaleType = 'image';
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 240, height: 200 });
  canvas.add(image);
  mountEditorSelectionChrome(canvas, {
    getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
  } as never);
  const root = canvas.upperCanvasEl.parentElement!;
  const previews = () =>
    root.querySelectorAll('[data-ui="editor.canvas.selection-preview"] polygon');
  try {
    canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 70, clientY: 70 }));
    expect(previews()).toHaveLength(1);
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
    expect(canvas.getActiveObjects()).toEqual([]);
    expect(previews()).toHaveLength(1);
    const releaseBorders: number[] = [];
    canvas.on('mouse:up', () => releaseBorders.push(previews().length));
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70 }));
    expect(releaseBorders).toEqual([1]);
    expect(canvas.getActiveObject()).toBe(image);
    expect(previews()).toHaveLength(0);
    expect(root.querySelector('[data-control="tl"]')).not.toBeNull();
  } finally {
    disposeEditorSelectionChrome(canvas);
    void canvas.dispose();
    vi.unstubAllGlobals();
  }
});
