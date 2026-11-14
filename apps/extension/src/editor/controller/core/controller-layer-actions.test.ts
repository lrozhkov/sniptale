// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { Canvas, FabricImage, Group, Rect } from 'fabric';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { getEditorVectorDefinition } from '../../objects/vector-elements/runtime';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorDocument } from '../../../features/editor/document/types';
import { CUSTOM_JSON_PROPS } from '../../document/model/custom-json-props';
import { flushDeferredEditorHistory } from '../history';
import type { EditorControllerInstance } from '../instance/types';
import { createImageEditorController } from './controller';

const canvases: Canvas[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(canvases.splice(0).map((canvas) => canvas.dispose()));
});

function fixture() {
  const canvas = new Canvas(undefined, { width: 100, height: 100, renderOnAddRemove: false });
  canvases.push(canvas);
  const objects = ['lower', 'vector', 'upper'].map((id) => {
    const object = new Rect({ left: 10, top: 20, width: 20, height: 10, strokeWidth: 0 });
    object.sniptaleId = id;
    object.sniptaleType = 'shape';
    object.sniptaleLabel = id;
    return object;
  });
  canvas.add(...objects);
  const controller: EditorControllerInstance = createImageEditorController();
  controller.canvas = canvas;
  const snapshot = (): EditorDocument => ({
    version: 2,
    canvasWidth: 100,
    canvasHeight: 100,
    canvasJson: JSON.stringify(canvas.toObject([...CUSTOM_JSON_PROPS])),
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceImageData: 'data:image/png;base64,abc',
    sourceName: 'contract fixture',
    sourceWidth: 100,
    sourceHeight: 100,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 100,
    sourceLeft: 0,
    sourceTop: 0,
  });
  vi.spyOn(controller, 'exportDocument').mockImplementation(snapshot);
  vi.spyOn(controller, 'applyDocument').mockImplementation(async (document) => {
    await canvas.loadFromJSON(document.canvasJson);
  });
  vi.spyOn(controller, 'syncRuntimeState').mockImplementation(() => {});
  const commit = vi.spyOn(controller, 'commitHistory');
  controller.history = new SnapshotHistory(JSON.stringify(snapshot()));
  return { canvas, controller, objects, commit };
}

it('moves a disjoint block through the controller in one history step and undoes its order', async () => {
  const { canvas, controller, commit } = fixture();
  controller.reorderLayerBlock(['lower', 'upper'], null);
  expect(canvas.getObjects().map((object) => object.sniptaleId)).toEqual([
    'lower',
    'upper',
    'vector',
  ]);
  expect(commit).toHaveBeenCalledOnce();
  flushDeferredEditorHistory(controller.history);
  expect(controller.history?.getState()).toMatchObject({ index: 1, size: 2 });

  await controller.undo();
  expect(canvas.getObjects().map((object) => object.sniptaleId)).toEqual([
    'lower',
    'vector',
    'upper',
  ]);
  expect(controller.history?.getState()).toMatchObject({ index: 0, size: 2, canRedo: true });
});

it('rasterizes the selected row through the controller once and undoes to the original vector', async () => {
  const { canvas, controller, objects, commit } = fixture();
  const target = objects[1]!;
  canvas.setActiveObject(target);
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => {
    const bitmap = document.createElement('canvas');
    bitmap.width = 20;
    bitmap.height = 10;
    return new FabricImage(bitmap);
  });

  expect(await controller.rasterizeLayer('vector')).toBe(true);
  expect(canvas.getObjects()[1]).toBeInstanceOf(FabricImage);
  expect(canvas.getActiveObject()).toMatchObject({ sniptaleId: 'vector', sniptaleLabel: 'vector' });
  expect(commit).toHaveBeenCalledOnce();
  flushDeferredEditorHistory(controller.history);
  expect(controller.history?.getState()).toMatchObject({ index: 1, size: 2 });

  await controller.undo();
  expect(canvas.getObjects()[1]).toBeInstanceOf(Rect);
  expect(canvas.getObjects()[1]).toMatchObject({ sniptaleId: 'vector', sniptaleLabel: 'vector' });
  expect(controller.history?.getState()).toMatchObject({ index: 0, size: 2 });
});

it('refuses locked block moves and rasterization without changing accepted work or history', async () => {
  const { canvas, controller, objects, commit } = fixture();
  const target = objects[1]!;
  target.sniptaleLocked = true;
  canvas.setActiveObject(target);
  controller.reorderLayerBlock(['vector'], null);
  expect(await controller.rasterizeLayer('vector')).toBe(false);
  expect(await controller.rasterizeLayer('missing')).toBe(false);
  expect(canvas.getObjects()).toEqual(objects);
  expect(canvas.getActiveObject()).toBe(target);
  expect(commit).not.toHaveBeenCalled();
  expect(controller.history?.getState()).toMatchObject({ index: 0, size: 1 });
});

it('keeps published vectors editable through controller copy and paste after a style preview', async () => {
  const canvas = new Canvas(undefined, { width: 300, height: 200, renderOnAddRemove: false });
  canvases.push(canvas);
  const publish = vi.fn(async () => ({
    assetId: 'vector-asset',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'vector-object' },
    mimeType: 'application/json',
    sha256: null,
    size: 100,
  }));
  const controller = createImageEditorController({ vectorElements: { publish } });
  controller.canvas = canvas;
  controller.source = {
    id: 'source',
    name: null,
    dataUrl: '',
    intrinsicWidth: 300,
    intrinsicHeight: 200,
    left: 0,
    top: 0,
    displayWidth: 300,
    displayHeight: 200,
    visible: true,
    locked: false,
  };
  const commit = vi.spyOn(controller, 'commitHistory').mockImplementation(() => {});
  vi.spyOn(controller, 'syncRuntimeState').mockImplementation(() => {});
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="20" height="20" fill="red"/></svg>',
    {
      sourceId: 'local',
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    }
  );
  expect(controller.getVectorClipboardAvailability()).toEqual({ canCopy: false, canPaste: false });
  expect(await controller.insertVectorElement(definition, { x: 70, y: 60 })).toBe(true);
  const original = canvas.getActiveObject()!;
  expect(original.getCenterPoint()).toMatchObject({ x: 70, y: 60 });
  const style = await controller.beginVectorStyleEdit();
  expect(style?.preview({ opacity: 0.3 })).toBe(true);
  expect(await controller.copyVectorSelection()).toBe(true);
  expect(original.opacity).toBe(1);
  expect(controller.getVectorClipboardAvailability()).toEqual({ canCopy: true, canPaste: true });
  expect(await controller.pasteVectorSelection({ x: 180, y: 90 })).toBe(true);
  const pasted = canvas.getActiveObject();
  if (!(pasted instanceof Group)) throw new Error('Missing pasted vector group');
  expect(canvas.getObjects()).toEqual([original, pasted]);
  expect(pasted.sniptaleId).not.toBe(original.sniptaleId);
  expect(pasted.getCenterPoint()).toMatchObject({ x: 180, y: 90 });
  expect(getEditorVectorDefinition(pasted)).toEqual(definition);
  expect(pasted.sniptaleVectorElement).toEqual(original.sniptaleVectorElement);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(commit).toHaveBeenCalledTimes(2);
});

it('commits a reorder above a managed background once and restores its order with Undo and Redo', async () => {
  const { canvas, controller, commit } = fixture();
  const background = new Rect({ width: 100, height: 100 });
  background.sniptaleId = 'background';
  background.sniptaleType = 'background';
  const source = new Rect({ width: 100, height: 100 });
  source.sniptaleId = 'source';
  source.sniptaleType = 'source-image';
  source.sniptaleLocked = true;
  canvas.insertAt(0, background, source);
  controller.history = new SnapshotHistory(JSON.stringify(controller.exportDocument()));
  const order = () => canvas.getObjects().map((object) => object.sniptaleId);
  const before = order();
  canvas.setActiveObject(canvas.getObjects().find((object) => object.sniptaleId === 'upper')!);
  controller.reorderLayerBlock(['upper'], 'lower');
  const after = ['background', 'source', 'lower', 'upper', 'vector'];
  expect(order()).toEqual(after);
  expect(canvas.getActiveObject()?.sniptaleId).toBe('upper');
  expect(commit).toHaveBeenCalledOnce();
  flushDeferredEditorHistory(controller.history);
  await controller.undo();
  expect(order()).toEqual(before);
  await controller.redo();
  expect(order()).toEqual(after);
});
