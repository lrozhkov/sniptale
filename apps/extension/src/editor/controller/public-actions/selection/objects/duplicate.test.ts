// @vitest-environment jsdom
import { Canvas, Group, Rect, util, type FabricObject } from 'fabric';
import { buildScenarioEditorCanvasDocument } from '../../../../../features/scenario/capture-step/editor-canvas-document';
import { normalizeScenarioAnnotationsInCanvasJson } from '../../../../document/scenario-annotation-import';
import { assertValidEditorDrawingCanvasJson } from '../../../../document/import-boundary';
import { CUSTOM_JSON_PROPS } from '../../../../document/model/custom-json-props';
import { expect, it, vi } from 'vitest';

import { createDefaultRichShapeObject } from '../../../../../features/editor/document/rich-shape';
import {
  createFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import { createObjectLabel } from '../../../../document/model';
import { parseEditorDrawingMetadata } from '../../../../document/import-boundary';
import { duplicateEditorSelection } from './duplicate';

it('clones the selection, assigns new identity, and selects the clone', async () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  const clone: {
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleDrawingJson?: string;
    sniptaleType: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    sniptaleType: 'shape',
    sniptaleDrawingJson: JSON.stringify({
      version: 1,
      object: {
        bounds: { height: 20, width: 30, x: 10, y: 15 },
        color: '#f00',
        fillColor: null,
        id: 'shape-original',
        kind: 'rectangle',
        width: 4,
      },
    }),
    set: vi.fn(),
  };
  const object = {
    clone: vi.fn(async () => clone),
    sniptaleType: 'shape',
  };
  const canvas = {
    add: vi.fn(),
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const prepareObject = vi.fn();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  await duplicateEditorSelection({
    canvas: canvas as never,
    commitHistory,
    nextLabelIndex: () => 3,
    prepareObject,
    syncRuntimeState,
  });

  expect(clone.set).toHaveBeenCalledWith({ left: 24, top: 24 });
  expect(clone.sniptaleId).toBe('00000000-0000-4000-8000-000000000001');
  expect(clone.sniptaleLabel).toBe(createObjectLabel('shape', 3));
  expect(parseEditorDrawingMetadata(clone.sniptaleDrawingJson)).toMatchObject({
    bounds: { x: 34, y: 39 },
    id: '00000000-0000-4000-8000-000000000001',
  });
  expect(prepareObject).toHaveBeenCalledWith(clone);
  expect(canvas.add).toHaveBeenCalledWith(clone);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(clone);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  randomUUID.mockRestore();
});

it.each([false, true])('roundtrips duplicated scenario blur (grouped: %s)', async (grouped) => {
  const document = buildScenarioEditorCanvasDocument({
    assetDataUrl: 'data:image/png;base64,doc',
    sourceWidth: 320,
    sourceHeight: 180,
    overlays: [
      {
        id: 'blur-original',
        kind: 'blur-rect',
        blurSettings: {
          amount: 9,
          blurType: 'solid',
          radius: 8,
          shadow: 0,
          showBorder: false,
          strokeColor: '#112233',
          strokeStyle: 'solid',
          strokeWidth: 0,
        },
        rect: { x: 12, y: 16, width: 80, height: 40 },
      },
    ],
  });
  const normalized = normalizeScenarioAnnotationsInCanvasJson(JSON.stringify(document));
  const [blur] = await util.enlivenObjects<FabricObject>(JSON.parse(normalized).objects);
  if (!blur) throw new Error('Missing blur fixture');
  const originalMetadata = blur.sniptaleScenarioBlurJson;
  const original = grouped ? new Group([blur]) : blur;
  if (grouped) {
    original.sniptaleId = 'group-original';
    original.sniptaleType = 'group';
  }
  const add = vi.fn();
  await duplicateEditorSelection({
    canvas: {
      getActiveObjects: () => [original],
      add,
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never,
    commitHistory: vi.fn(),
    nextLabelIndex: () => 1,
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
  });
  const clone = add.mock.calls[0]![0] as FabricObject;
  const saved = JSON.stringify({ objects: [clone.toObject([...CUSTOM_JSON_PROPS])] });
  expect(() => assertValidEditorDrawingCanvasJson(saved)).not.toThrow();
  const [reopened] = await util.enlivenObjects<FabricObject>(JSON.parse(saved).objects);
  const copiedBlur = reopened instanceof Group ? reopened.getObjects()[0]! : reopened!;
  expect(copiedBlur.sniptaleId).not.toBe(blur.sniptaleId);
  expect(JSON.parse(copiedBlur.sniptaleScenarioBlurJson!)).toMatchObject({
    id: copiedBlur.sniptaleId,
  });
  expect(blur.sniptaleScenarioBlurJson).toBe(originalMetadata);
});

it('rejects a clone result after selection replacement without adding a layer or history', async () => {
  let release: (clone: unknown) => void = () => {};
  const clone = { set: vi.fn(), dispose: vi.fn(), sniptaleType: 'shape' };
  const object = {
    sniptaleType: 'shape',
    clone: vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    ),
  };
  let selection: unknown[] = [object];
  const canvas = {
    getActiveObjects: () => selection,
    add: vi.fn(),
    setActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const commitHistory = vi.fn();
  const pending = duplicateEditorSelection({
    canvas: canvas as never,
    prepareObject: vi.fn(),
    nextLabelIndex: () => 1,
    commitHistory,
    syncRuntimeState: vi.fn(),
  });
  selection = [];
  release(clone);
  await pending;
  expect(canvas.add).not.toHaveBeenCalled();
  expect(commitHistory).not.toHaveBeenCalled();
  expect(clone.dispose).toHaveBeenCalledOnce();
});

it('duplicates rich shape and frame metadata with independent identities and frame ordering', async () => {
  const shape = new Rect({ left: 10, top: 20, width: 30, height: 40 });
  shape.sniptaleId = 'rich-original';
  shape.sniptaleType = 'rich-shape';
  shape.sniptaleRichShape = createDefaultRichShapeObject({ id: 'rich-original' });
  const frame = createFrameAnnotationProxy({
    frame: { id: 'frame-original', x: 20, y: 30, width: 100, height: 80 },
    label: 'Frame 1',
    ordering: 3,
  });
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  canvas.add(shape, frame);
  const commitHistory = vi.fn();
  const duplicate = () =>
    duplicateEditorSelection({
      canvas,
      commitHistory,
      prepareObject: vi.fn(),
      nextLabelIndex: () => 2,
      syncRuntimeState: vi.fn(),
    });
  try {
    canvas.setActiveObject(shape);
    await duplicate();
    const copiedShape = canvas.getActiveObject()!;
    expect(copiedShape.sniptaleRichShape).toEqual({
      ...shape.sniptaleRichShape,
      id: copiedShape.sniptaleId,
    });
    expect(copiedShape.sniptaleRichShape).not.toBe(shape.sniptaleRichShape);
    expect(copiedShape.sniptaleId).not.toBe(shape.sniptaleId);
    expect(shape.sniptaleRichShape.id).toBe('rich-original');
    canvas.setActiveObject(frame);
    await duplicate();
    const copiedFrame = canvas.getActiveObject()!;
    expect(readFrameAnnotationSnapshot(copiedFrame)).toMatchObject({
      id: copiedFrame.sniptaleId,
      x: 44,
      y: 54,
      ordering: 4,
    });
    expect(readFrameAnnotationSnapshot(frame)).toMatchObject({
      id: 'frame-original',
      x: 20,
      y: 30,
      ordering: 3,
    });
    expect(commitHistory).toHaveBeenCalledTimes(2);
  } finally {
    await canvas.dispose();
  }
});

it('duplicates a nested selected child in scene coordinates and preserves its parent', async () => {
  const child = new Rect({ left: 10, top: 20, width: 30, height: 40 });
  child.sniptaleId = 'child';
  child.sniptaleType = 'shape';
  const parent = new Group([child], { left: 80, top: 90, scaleX: 2, scaleY: 2 });
  parent.sniptaleId = 'parent';
  parent.sniptaleType = 'group';
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  canvas.add(parent);
  vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([child]);
  const commitHistory = vi.fn();
  const before = child.getCenterPoint();
  try {
    await duplicateEditorSelection({
      canvas,
      commitHistory,
      prepareObject: vi.fn(),
      nextLabelIndex: () => 2,
      syncRuntimeState: vi.fn(),
    });
    const copy = canvas.getActiveObject()!;
    expect(parent.getObjects()).toEqual([child, copy]);
    expect(canvas.getObjects()).toEqual([parent]);
    expect(copy.sniptaleId).not.toBe(child.sniptaleId);
    expect(copy.parent).toBe(parent);
    expect(copy.getCenterPoint().x).toBeCloseTo(before.x + 24, 8);
    expect(copy.getCenterPoint().y).toBeCloseTo(before.y + 24, 8);
    expect(commitHistory).toHaveBeenCalledOnce();
  } finally {
    await canvas.dispose();
  }
});
