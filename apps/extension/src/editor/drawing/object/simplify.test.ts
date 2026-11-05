// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { Canvas, FabricImage, Group } from 'fabric';
import { createDefaultSimplifySettings } from '../../../features/simplify/settings';
import { createTypedTestFixture } from '../../testing/fabric-canvas.test-support';
import { createCanvas, loadImage } from 'canvas';
import {
  createEditorDrawingSimplifyObject,
  sampleEditorSimplifyRegion,
  setEditorSimplifyGeometryPreview,
} from './simplify';
import { CUSTOM_JSON_PROPS } from '../../document/model/custom-json-props';
import { refreshPreparedObjectGeometry } from '../../controller/document/objects/geometry-refresh';
import { renderEditorCanvasToDataUrl } from '../../controller/document/export';
import { readEditorDrawingObject, synchronizeEditorDrawingObjectFromFabric } from './metadata';
import { serializeCanvasObjects } from '../../controller/document/serialization';
import { assertValidEditorDrawingCanvasJson } from '../../document/import-boundary';
import { restoreCanonicalEditorDrawingObjects } from './canonicalize';
it('round-trips accepted Simplify pixels and source mapping outside JSON metadata', async () => {
  const image = document.createElement('canvas');
  image.width = 20;
  image.height = 10;
  const snapshot = { dataUrl: image.toDataURL('image/png'), width: 20, height: 10 };
  const drawing = {
    id: 'simplify-1',
    kind: 'simplify',
    bounds: { x: 30, y: 40, width: 80, height: 40 },
    rotation: 30,
    settings: createDefaultSimplifySettings(),
    result: snapshot,
    source: { ...snapshot, bounds: { x: 0, y: 0, width: 200, height: 100 } },
  } as const;
  const canvas = new Canvas(document.createElement('canvas'));
  const object = createEditorDrawingSimplifyObject(drawing, 1, image);
  canvas.add(object);
  expect(object.getCenterPoint()).toMatchObject({ x: 70, y: 60 });
  expect(synchronizeEditorDrawingObjectFromFabric(object)).toMatchObject(drawing);
  const saved = serializeCanvasObjects(canvas);
  assertValidEditorDrawingCanvasJson(saved);
  const raw = JSON.parse(saved).objects[0];
  expect(raw.sniptaleDrawingJson).not.toContain('data:image');
  expect(raw.src).toBe(snapshot.dataUrl);
  expect(raw.sniptaleSimplifySourceData).toBe(snapshot.dataUrl);
  const decode = vi
    .spyOn(FabricImage, 'fromObject')
    .mockImplementation(async (raw) => Object.assign(new FabricImage(image), raw));
  const reopened = new Canvas(document.createElement('canvas'));
  await reopened.loadFromJSON(saved);
  restoreCanonicalEditorDrawingObjects({
    canvas: reopened,
    source: null,
    prepareObject: () => undefined,
  });
  expect(readEditorDrawingObject(reopened.getObjects()[0]!)).toMatchObject(drawing);
  expect(reopened.getObjects()[0]!.angle).toBe(30);
  decode.mockRestore();
  void canvas.dispose();
  void reopened.dispose();
});

it.each([15, 90])(
  'keeps automatic source pixels aligned under a %i degree mask in canvas and PNG export',
  async (rotation) => {
    const source = document.createElement('canvas');
    source.width = 100;
    source.height = 100;
    const context = source.getContext('2d')!;
    for (const [x, y, color] of [
      [0, 0, '#ff0000'],
      [50, 0, '#0000ff'],
      [0, 50, '#00ff00'],
      [50, 50, '#ffff00'],
    ] as const) {
      context.fillStyle = color;
      context.fillRect(x, y, 50, 50);
    }
    const drawing = {
      id: `rotated-${rotation}`,
      kind: 'simplify',
      bounds: { x: 30, y: 40, width: 40, height: 20 },
      rotation,
      settings: createDefaultSimplifySettings(),
      source: {
        dataUrl: source.toDataURL('image/png'),
        width: 100,
        height: 100,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
    } as const;
    const { region } = sampleEditorSimplifyRegion(drawing, drawing.source);
    const tile = document.createElement('canvas');
    tile.width = region.width;
    tile.height = region.height;
    tile.getContext('2d')!.drawImage(source, -region.x, -region.y);
    const object = createEditorDrawingSimplifyObject(
      {
        ...drawing,
        result: { dataUrl: tile.toDataURL('image/png'), width: tile.width, height: tile.height },
      },
      1,
      tile
    );
    const canvas = new Canvas(document.createElement('canvas'), {
      width: 100,
      height: 100,
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    canvas.add(object);
    canvas.renderAll();
    const samples = [
      [45, 45],
      [55, 45],
      [45, 55],
      [55, 55],
    ] as const;
    for (const [x, y] of samples)
      expect([...canvas.getContext().getImageData(x, y, 1, 1).data]).toEqual([
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    expect(canvas.getContext().getImageData(10, 10, 1, 1).data[3]).toBe(0);
    const exported = renderEditorCanvasToDataUrl(canvas, { format: 'png', quality: 1 });
    const decoded = await loadImage(exported);
    const pixels = createCanvas(100, 100).getContext('2d');
    pixels.drawImage(decoded, 0, 0);
    for (const [x, y] of samples)
      expect([...pixels.getImageData(x, y, 1, 1).data]).toEqual([
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    expect(pixels.getImageData(10, 10, 1, 1).data[3]).toBe(0);
    const decode = vi
      .spyOn(FabricImage, 'fromObject')
      .mockImplementation(async (raw) => Object.assign(new FabricImage(tile), raw));
    const cloned = await object.clone([...CUSTOM_JSON_PROPS]);
    refreshPreparedObjectGeometry(cloned);
    canvas.remove(object);
    canvas.add(cloned);
    canvas.renderAll();
    for (const [x, y] of samples)
      expect([...canvas.getContext().getImageData(x, y, 1, 1).data]).toEqual([
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    canvas.remove(cloned);
    const group = new Group([cloned]);
    group.sniptaleType = 'group';
    canvas.add(group);
    group.set({ left: group.left + 5, top: group.top + 5 });
    canvas.renderAll();
    for (const [x, y] of samples)
      expect([...canvas.getContext().getImageData(x + 5, y + 5, 1, 1).data]).toEqual([
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    const groupClone = await group.clone([...CUSTOM_JSON_PROPS]);
    refreshPreparedObjectGeometry(groupClone);
    canvas.remove(group);
    canvas.add(groupClone);
    canvas.renderAll();
    for (const [x, y] of samples)
      expect([...canvas.getContext().getImageData(x + 5, y + 5, 1, 1).data]).toEqual([
        ...context.getImageData(x, y, 1, 1).data,
      ]);
    decode.mockRestore();
    void canvas.dispose();
  }
);

it.each([true, false])(
  'shows an unstretched clean mask while resizing automatic=%s',
  async (automatic) => {
    const source = document.createElement('canvas');
    source.width = 100;
    source.height = 100;
    const context = source.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 50, 100);
    context.fillStyle = '#0000ff';
    context.fillRect(50, 0, 50, 100);
    const tile = document.createElement('canvas');
    tile.width = 40;
    tile.height = 20;
    tile.getContext('2d')!.fillStyle = '#ff7f50';
    tile.getContext('2d')!.fillRect(0, 0, 40, 20);
    const drawing = {
      id: 'resize-preview',
      kind: 'simplify',
      bounds: { x: 30, y: 40, width: 40, height: 20 },
      settings: { ...createDefaultSimplifySettings(), automatic },
      result: { dataUrl: tile.toDataURL('image/png'), width: 40, height: 20 },
      source: {
        dataUrl: source.toDataURL('image/png'),
        width: 100,
        height: 100,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
    } as const;
    const object = createEditorDrawingSimplifyObject(drawing, 1, tile);
    const canvas = new Canvas(document.createElement('canvas'), {
      width: 100,
      height: 100,
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    canvas.add(
      new FabricImage(source, { left: 0, top: 0, originX: 'left', originY: 'top' }),
      object
    );
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(45, 45, 1, 1).data]).toEqual([255, 127, 80, 255]);
    object.set({ scaleX: object.scaleX * 2 });
    canvas._currentTransform = createTypedTestFixture<NonNullable<Canvas['_currentTransform']>>({
      target: object,
      action: 'scaleX',
    });
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(25, 45, 1, 1).data]).toEqual([255, 0, 0, 255]);
    expect([...canvas.getContext().getImageData(75, 45, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect(readEditorDrawingObject(object)).toMatchObject({
      result: drawing.result,
      source: drawing.source,
      bounds: drawing.bounds,
    });
    canvas._currentTransform = null;
    setEditorSimplifyGeometryPreview(object, true);
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(25, 45, 1, 1).data]).toEqual([255, 0, 0, 255]);
    const exported = await loadImage(
      renderEditorCanvasToDataUrl(canvas, { format: 'png', quality: 1 })
    );
    const pixels = createCanvas(100, 100).getContext('2d');
    pixels.drawImage(exported, 0, 0);
    expect([...pixels.getImageData(25, 45, 1, 1).data]).toEqual([255, 127, 80, 255]);
    setEditorSimplifyGeometryPreview(object, false);
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(25, 45, 1, 1).data]).toEqual([255, 127, 80, 255]);
    void canvas.dispose();
  }
);

it(
  'uses a flat manual-image target during nonuniform resize and preserves its accepted ' +
    'glyph for export and cancel',
  async () => {
    const tile = document.createElement('canvas');
    tile.width = 100;
    tile.height = 100;
    const pixels = tile.getContext('2d')!;
    pixels.fillStyle = '#ff7f50';
    pixels.fillRect(0, 0, 100, 100);
    pixels.fillStyle = '#0000ff';
    pixels.fillRect(34, 34, 32, 32);
    const object = createEditorDrawingSimplifyObject(
      {
        id: 'manual-resize',
        kind: 'simplify',
        bounds: { x: 10, y: 10, width: 100, height: 100 },
        settings: { ...createDefaultSimplifySettings(), automatic: false, manualKind: 'image' },
        result: { dataUrl: tile.toDataURL('image/png'), width: 100, height: 100 },
      },
      1,
      tile
    );
    const canvas = new Canvas(document.createElement('canvas'), {
      width: 200,
      height: 150,
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    canvas.add(object);
    object.set({ scaleX: object.scaleX * 2 });
    canvas._currentTransform = createTypedTestFixture<NonNullable<Canvas['_currentTransform']>>({
      target: object,
      action: 'scaleX',
    });
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(60, 60, 1, 1).data]).toEqual([255, 127, 80, 255]);
    canvas._currentTransform = null;
    setEditorSimplifyGeometryPreview(object, true);
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(60, 60, 1, 1).data]).toEqual([255, 127, 80, 255]);
    const decoded = await loadImage(
      renderEditorCanvasToDataUrl(canvas, { format: 'png', quality: 1 })
    );
    const output = createCanvas(200, 150).getContext('2d');
    output.drawImage(decoded, 0, 0);
    expect([...output.getImageData(60, 60, 1, 1).data]).toEqual([0, 0, 255, 255]);
    setEditorSimplifyGeometryPreview(object, false);
    canvas.renderAll();
    expect([...canvas.getContext().getImageData(60, 60, 1, 1).data]).toEqual([0, 0, 255, 255]);
    void canvas.dispose();
  }
);
