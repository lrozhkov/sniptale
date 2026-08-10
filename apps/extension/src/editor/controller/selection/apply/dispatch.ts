import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { replaceEditorDrawingFabricGeometry } from '../../../drawing/object/vector';
import { applyStepSettings } from './annotation';
import { applyImageLayerSettings } from './image';

function applyDrawingSettings(object: FabricObject, settings: EditorToolSettings): FabricObject {
  const drawing = readEditorDrawingObject(object);
  if (!drawing || drawing.kind === 'blur') return object;
  let nextDrawing: Exclude<typeof drawing, { kind: 'blur' }>;
  if (drawing.kind === 'pencil') {
    nextDrawing = { ...drawing, ...settings.pencil };
  } else if (drawing.kind === 'marker') {
    nextDrawing = { ...drawing, ...settings.marker };
  } else if (drawing.kind === 'arrow') {
    nextDrawing = { ...drawing, ...settings.arrow };
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
): void {
  const entries = objects
    .map((object) => ({
      index: canvas.getObjects().indexOf(object),
      object,
      replacement: applyDrawingSettings(object, settings),
    }))
    .filter((entry) => entry.index >= 0);
  if (entries.every((entry) => entry.replacement === entry.object)) return;
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
}

export function applySelectionToolSettingsToObjects(
  canvas: Canvas,
  objects: FabricObject[],
  selectedType: EditorObjectType,
  selectionToolSettings: EditorToolSettings,
  prepareObject: (object: FabricObject) => void = () => undefined
): void {
  switch (selectedType) {
    case 'transparent-base':
    case 'browser-frame':
    case 'frame-annotation':
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
    case 'blur':
      replaceDrawingObjectsOnCanvas(canvas, objects, selectionToolSettings, prepareObject);
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
