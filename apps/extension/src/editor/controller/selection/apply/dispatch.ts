import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';
import { resolveUpdatedQuickObject } from '../../../../features/drawing/public';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import {
  readEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../../drawing/object/metadata';
import {
  createEditorDrawingBlurObject,
  refreshEditorDrawingBlurObject,
} from '../../../drawing/object/blur';
import { replaceEditorDrawingFabricGeometry } from '../../../drawing/object/vector';
import { parseScenarioBlurMetadata } from '../../../document/scenario-blur-metadata';
import { updateBlurObject } from '../../../objects/annotation/blur/object';
import { applyStepSettings } from './annotation';
import { applyImageLayerSettings } from './image';

function applyDrawingSettings(object: FabricObject, settings: EditorToolSettings): FabricObject {
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind === 'simplify' && drawing.settings.erase && !settings.blur.clean) {
    const replacement = createEditorDrawingBlurObject({
      drawing: {
        id: drawing.id,
        kind: 'blur',
        bounds: drawing.bounds,
        ...(drawing.rotation === undefined ? {} : { rotation: drawing.rotation }),
        amount: settings.blur.amount,
      },
      labelIndex: 1,
    });
    if (object.sniptaleLabel !== undefined) replacement.sniptaleLabel = object.sniptaleLabel;
    if (object.sniptaleLocked !== undefined) replacement.sniptaleLocked = object.sniptaleLocked;
    replacement.visible = object.visible;
    return replacement;
  }
  if (!drawing || drawing.kind === 'blur' || drawing.kind === 'simplify') return object;
  let nextDrawing: Exclude<typeof drawing, { kind: 'blur' }>;
  if (drawing.kind === 'pencil') {
    nextDrawing = { ...drawing, ...settings.pencil };
  } else if (drawing.kind === 'marker') {
    nextDrawing = { ...drawing, ...settings.marker };
  } else if (drawing.kind === 'arrow') {
    nextDrawing = resolveUpdatedQuickObject(drawing, settings.arrow);
  } else if (drawing.kind === 'text') {
    nextDrawing = { ...drawing, ...settings.text };
  } else {
    const kind =
      drawing.kind === 'parallelogram' && settings.shape.kind === 'rectangle'
        ? drawing.kind
        : settings.shape.kind;
    nextDrawing = {
      ...drawing,
      color: settings.shape.color,
      fillColor: settings.shape.fillColor,
      kind,
      width: settings.shape.width,
    };
  }
  return replaceEditorDrawingFabricGeometry(object, nextDrawing);
}

function replaceDrawingObjectsOnCanvas(
  canvas: Canvas,
  objects: FabricObject[],
  settings: EditorToolSettings,
  prepareObject: (object: FabricObject) => void
): FabricObject[] {
  const entries = objects
    .map((object) => ({
      index: canvas.getObjects().indexOf(object),
      object,
      replacement: applyDrawingSettings(object, settings),
    }))
    .filter((entry) => entry.index >= 0);
  if (entries.every((entry) => entry.replacement === entry.object)) return objects;
  canvas.discardActiveObject();
  entries.forEach((entry) => canvas.remove(entry.object));
  entries
    .toSorted((left, right) => left.index - right.index)
    .forEach((entry) => {
      prepareObject(entry.replacement);
      canvas.insertAt(entry.index, entry.replacement);
    });
  const replacements = entries.map((entry) => entry.replacement);
  const active =
    replacements.length === 1 ? replacements[0] : new ActiveSelection(replacements, { canvas });
  if (active) canvas.setActiveObject(active);
  return replacements;
}

export function applySelectionToolSettingsToObjects(
  canvas: Canvas,
  objects: FabricObject[],
  selectedType: EditorObjectType,
  selectionToolSettings: EditorToolSettings,
  prepareObject: (object: FabricObject) => void = () => undefined
): void {
  switch (selectedType) {
    case 'simplify':
      return;
    case 'transparent-base':
    case 'browser-frame':
    case 'frame-annotation':
    case 'group':
      return;
    case 'source-image':
    case 'image':
    case 'background': {
      applyImageLayerSettings(objects, selectionToolSettings.image);
      return;
    }
    case 'pencil':
    case 'marker':
    case 'shape':
    case 'arrow':
    case 'text':
      replaceDrawingObjectsOnCanvas(canvas, objects, selectionToolSettings, prepareObject);
      return;
    case 'blur':
      objects = replaceDrawingObjectsOnCanvas(
        canvas,
        objects,
        selectionToolSettings,
        prepareObject
      );
      objects.forEach((object) => {
        const drawing = readEditorDrawingObject(object);
        if (drawing?.kind !== 'blur') {
          const scenarioBlur = parseScenarioBlurMetadata(object.sniptaleScenarioBlurJson);
          if (scenarioBlur) {
            updateBlurObject(object, {
              settings: { ...scenarioBlur.settings, amount: selectionToolSettings.blur.amount },
            });
          }
          return;
        }
        writeEditorDrawingObject(object, { ...drawing, amount: selectionToolSettings.blur.amount });
        refreshEditorDrawingBlurObject(object);
      });
      canvas.requestRenderAll();
      return;
    case 'step':
      applyStepSettings(objects, selectionToolSettings.step);
      return;
    case 'rich-shape':
      return;
    case 'meta-stamp':
      return;
  }
}
