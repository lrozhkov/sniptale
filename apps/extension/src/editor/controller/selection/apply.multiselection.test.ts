// @vitest-environment jsdom
import { createObjectModifiedHandler } from '../events/runtime.object-modified';
import { createTypedTestFixture } from '../../testing/fabric-canvas.test-support';
import { normalizeFrameAnnotationsInCanvasJson } from '../../frame-annotation/import-boundary';
import {
  restoreFrameAnnotationProxyFromMetadata,
  readFrameAnnotationSnapshot,
  normalizeFrameAnnotationProxyGeometry,
} from '../../frame-annotation/proxy';
import { ensureEditorObjectReachable } from '../document/visibility/reachability';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { ActiveSelection, Canvas, Point } from 'fabric';
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/public';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import {
  canonicalizeModifiedEditorDrawingSelection,
  restoreCanonicalEditorDrawingObjects,
} from '../../drawing/object/canonicalize';
import { assertValidEditorDrawingCanvasJson } from '../../document/import-boundary';
import { serializeCanvasObjects } from '../document/serialization';
import { prepareEditorObject } from '../document/objects/prepare';
import { createSelectionChangeHandler } from '../events/runtime.selection';
import { applySelectionToolSettingsToObjects } from './apply/dispatch';
import {
  createFrameAnnotationProxy,
  collectFrameAnnotationProxies,
} from '../../frame-annotation/proxy';

const prepareObject = (object: Parameters<typeof prepareEditorObject>[0]) =>
  prepareEditorObject(object, { onTextboxExitCommit() {}, onTextboxExitEmpty() {} });

it('keeps arrow multi-selection blue and restorable after common styles and movement', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const selection = createSelectionChangeHandler({
    getCanvas: () => canvas,
    syncRuntimeState() {},
  });
  canvas.on('selection:created', selection);
  canvas.on('selection:updated', selection);
  const objects = (['standard', 'freehand'] as const).map((design, index) => {
    const object = createEditorDrawingFabricObject(
      {
        id: `arrow-${index}`,
        kind: 'arrow',
        design,
        color: '#ff0000',
        width: index + 2,
        ...(design === 'freehand' ? { bendPoints: [{ x: 90, y: 120 }] } : {}),
        dynamicWidth: false,
        start: { x: 30, y: 40 + index * 100 },
        end: { x: 200, y: 70 + index * 100 },
      },
      index + 1
    );
    prepareObject(object);
    return object;
  });
  canvas.add(...objects);
  canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
  const defaults = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);
  const settings = {
    ...defaults,
    arrow: { ...defaults.arrow, design: 'standard' as const, width: 8 },
  };
  applySelectionToolSettingsToObjects(
    canvas,
    canvas.getActiveObjects(),
    'arrow',
    settings,
    prepareObject
  );
  expect(canvas.getActiveObject()?.borderColor).toBe('#2563eb');
  const styled = serializeCanvasObjects(canvas);
  expect(() => assertValidEditorDrawingCanvasJson(styled)).not.toThrow();
  const active = canvas.getActiveObject()!;
  active.set({ left: active.left + 50, top: active.top + 30 });
  active.setCoords();
  canonicalizeModifiedEditorDrawingSelection({
    canvas,
    object: active,
    source: null,
    prepareObject,
  });
  const moved = serializeCanvasObjects(canvas);
  expect(() => assertValidEditorDrawingCanvasJson(moved)).not.toThrow();
  for (const json of [styled, moved, styled, moved]) {
    await canvas.loadFromJSON(json);
    restoreCanonicalEditorDrawingObjects({ canvas, source: null, prepareObject });
    expect(canvas.getObjects().map((object) => readEditorDrawingObject(object)?.kind)).toEqual([
      'arrow',
      'arrow',
    ]);
  }
  await canvas.dispose();
});

it('projects native multi-selection translation into visible annotation coordinates', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const objects = (['step-badge', 'callout', undefined] as const).map((annotationKind, index) => {
    const object = createFrameAnnotationProxy({
      frame: {
        id: `frame-${index}`,
        ...(annotationKind ? { annotationKind } : {}),
        x: 40 + index * 80,
        y: 60,
        width: annotationKind ? 1 : 100,
        height: annotationKind ? 1 : 60,
      },
      ordering: index,
      label: 'Annotation',
    });
    object.selectable = true;
    return object;
  });
  canvas.add(...objects);
  const active = new ActiveSelection(objects, { canvas });
  canvas.setActiveObject(active);
  active.set({ left: active.left + 50, top: active.top + 30 });
  active.setCoords();
  const projected = collectFrameAnnotationProxies(canvas.getObjects());
  projected.forEach(({ object, snapshot }) => {
    const expected = object.getXY();
    expect(new Point(snapshot.x, snapshot.y).distanceFrom(expected)).toBeLessThan(0.01);
  });
  const modified = createObjectModifiedHandler(
    createTypedTestFixture({
      getCanvas: () => canvas,
      getSource: () => null,
      setSource() {},
      getHistoryMuted: () => 0,
      ensureObjectReachable: () => true,
      prepareObject,
      commitHistory() {},
      syncRuntimeState() {},
    })
  );
  modified({ target: active });
  objects.forEach((object, index) =>
    expect(readFrameAnnotationSnapshot(object)).toMatchObject({
      x: 90 + index * 80,
      y: 90,
    })
  );
  const json = normalizeFrameAnnotationsInCanvasJson(serializeCanvasObjects(canvas));
  await canvas.loadFromJSON(json);
  canvas.getObjects().forEach((object, index) => {
    expect(restoreFrameAnnotationProxyFromMetadata(object)).toBe(true);
    expect(object.getXY()).toEqual(new Point(90 + index * 80, 90));
  });
  await canvas.dispose();
});

it('fits projected multi-selection bounds without moving its members', async () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const objects = [40, 160].map((x, index) => {
    const object = createFrameAnnotationProxy({
      frame: {
        id: `projected-${index}`,
        annotationKind: 'step-badge',
        x,
        y: 50,
        width: 1,
        height: 1,
      },
      ordering: index,
      label: 'Number',
    });
    object.selectable = true;
    return object;
  });
  canvas.add(...objects);
  canvas.setLayerPresentationBoundsResolver((object) => ({
    left: object.getXY().x - 15,
    top: object.getXY().y - 15,
    width: 30,
    height: 30,
  }));
  const selection = createSelectionChangeHandler({
    getCanvas: () => canvas,
    syncRuntimeState() {},
  });
  canvas.on('selection:created', selection);
  canvas.on('selection:updated', selection);
  const active = new ActiveSelection(objects, { canvas });
  canvas.setActiveObject(active);
  expect(active.getBoundingRect()).toMatchObject({ left: 25, top: 35, width: 150, height: 30 });
  expect(objects.map((object) => object.getXY())).toEqual([new Point(40, 50), new Point(160, 50)]);
  expect(active.borderColor).toBe('#2563eb');
  expect(active.hasControls).toBe(false);
  canvas.discardActiveObject();
  expect(objects.map((object) => object.getXY())).toEqual([new Point(40, 50), new Point(160, 50)]);
  await canvas.dispose();
});

it('normalizes frame metadata in scene coordinates while it remains in an active selection', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const objects = [20, 140].map((x, index) =>
    createFrameAnnotationProxy({
      frame: { id: `grouped-${index}`, x, y: 40, width: 80, height: 50 },
      ordering: index,
      label: 'Frame',
    })
  );
  canvas.add(...objects);
  const active = new ActiveSelection(objects, { canvas });
  canvas.setActiveObject(active);
  active.set({ left: active.left + 30, top: active.top + 20 });
  const expected = objects.map((object) => object.getXY());
  objects.forEach((object, index) => {
    normalizeFrameAnnotationProxyGeometry(object);
    expect(object.getXY()).toEqual(expected[index]);
    expect(readFrameAnnotationSnapshot(object)).toMatchObject({
      x: expected[index]!.x,
      y: expected[index]!.y,
    });
  });
  await canvas.dispose();
});

it('commits the reachable frame position when native movement is clamped', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const object = createFrameAnnotationProxy({
    frame: {
      id: 'clamped',
      x: 20,
      y: 20,
      width: 80,
      height: 50,
    },
    ordering: 0,
    label: 'Frame',
  });
  canvas.add(object);
  object.set({ left: 50000, top: 50000 });
  object.setCoords();
  const modified = createObjectModifiedHandler(
    createTypedTestFixture({
      getCanvas: () => canvas,
      getSource: () => null,
      setSource() {},
      getHistoryMuted: () => 0,
      ensureObjectReachable: (target: Parameters<typeof ensureEditorObjectReachable>[2]) =>
        ensureEditorObjectReachable(canvas, { width: 800, height: 320 }, target),
      prepareObject,
      commitHistory() {},
      syncRuntimeState() {},
    })
  );
  modified({ target: object });
  expect(object.left).toBeLessThan(50000);
  expect(readFrameAnnotationSnapshot(object)).toMatchObject({ x: object.left, y: object.top });
  await canvas.dispose();
});
