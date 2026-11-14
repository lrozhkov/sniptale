// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { Canvas, FabricImage, Rect } from 'fabric';
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
