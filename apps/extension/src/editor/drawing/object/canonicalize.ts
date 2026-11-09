import { ActiveSelection, FabricImage, type Canvas, type FabricObject } from 'fabric';
import type { SourceState } from '../../document/model/source-state';
import { carryEditorSimplifySourceContext } from '../simplify-runtime';
import { createEditorDrawingSimplifyObject } from './simplify';
import { createEditorDrawingBlurObject } from './blur';
import { readEditorDrawingObject, synchronizeEditorDrawingObjectFromFabric } from './metadata';
import { createEditorDrawingFabricObject } from './vector';

function copyEditorDrawingRuntimeState(source: FabricObject, target: FabricObject): void {
  if (source.sniptaleLabel !== undefined) target.sniptaleLabel = source.sniptaleLabel;
  if (source.sniptaleLocked !== undefined) target.sniptaleLocked = source.sniptaleLocked;
  target.visible = source.visible;
}

function createCanonicalObject(
  drawing: NonNullable<ReturnType<typeof readEditorDrawingObject>>,
  source: SourceState | null,
  original?: FabricObject
): FabricObject | null {
  if (drawing.kind === 'simplify')
    return createEditorDrawingSimplifyObject(
      drawing,
      1,
      original instanceof FabricImage ? original.getElement() : undefined
    );
  if (drawing.kind === 'blur') {
    if (!source) return null;
    return createEditorDrawingBlurObject({ drawing, labelIndex: 1, source });
  }
  return createEditorDrawingFabricObject(drawing, 1, { preserveTextWidth: true });
}

export function replaceEditorDrawingObjectWithCanonicalGeometry(args: {
  canvas: Canvas;
  object: FabricObject;
  prepareObject: (object: FabricObject) => void;
  source: SourceState | null;
  synchronizeTransform?: boolean;
}): FabricObject {
  const previous = readEditorDrawingObject(args.object);
  let drawing = args.synchronizeTransform
    ? synchronizeEditorDrawingObjectFromFabric(args.object)
    : readEditorDrawingObject(args.object);
  if (!drawing) return args.object;
  if (
    args.synchronizeTransform &&
    drawing.kind === 'simplify' &&
    previous?.kind === 'simplify' &&
    (JSON.stringify(drawing.bounds) !== JSON.stringify(previous.bounds) ||
      ((drawing.settings.automatic || drawing.settings.manualKind === 'text') &&
        drawing.rotation !== previous.rotation))
  )
    drawing = { ...drawing, sourceDirty: true };
  const replacement = createCanonicalObject(drawing, args.source, args.object);
  if (!replacement) return args.object;
  copyEditorDrawingRuntimeState(args.object, replacement);
  const index = args.canvas.getObjects().indexOf(args.object);
  if (index < 0) return args.object;
  args.canvas.remove(args.object);
  args.canvas.insertAt(index, replacement);
  args.prepareObject(replacement);
  if (drawing.kind === 'simplify')
    carryEditorSimplifySourceContext(args.canvas, args.object, replacement);
  return replacement;
}

export function canonicalizeModifiedEditorDrawingSelection(args: {
  canvas: Canvas;
  object: FabricObject;
  prepareObject: (object: FabricObject) => void;
  source: SourceState | null;
}): FabricObject[] | null {
  const selected =
    args.object instanceof ActiveSelection ? args.object.getObjects() : [args.object];
  const drawingObjects = selected.filter((object) => readEditorDrawingObject(object) !== null);
  if (drawingObjects.length === 0) return null;
  if (args.canvas._currentTransform?.target === args.object) args.canvas._currentTransform = null;
  if (args.object instanceof ActiveSelection) args.canvas.discardActiveObject();
  const replacements = selected.map((object) =>
    readEditorDrawingObject(object)
      ? replaceEditorDrawingObjectWithCanonicalGeometry({
          ...args,
          object,
          synchronizeTransform: true,
        })
      : object
  );
  args.canvas.setActiveObject(
    replacements.length === 1
      ? replacements[0]!
      : new ActiveSelection(replacements, { canvas: args.canvas })
  );
  args.canvas.requestRenderAll();
  return replacements;
}

export function restoreCanonicalEditorDrawingObjects(args: {
  canvas: Canvas;
  prepareObject: (object: FabricObject) => void;
  source: SourceState | null;
}): void {
  [...args.canvas.getObjects()].forEach((object) => {
    const replacement = replaceEditorDrawingObjectWithCanonicalGeometry({ ...args, object });
    if (replacement === object && readEditorDrawingObject(object)) args.prepareObject(object);
  });
}
