import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';

import { convertBackgroundDuplicateToAnnotation } from '../../../background';
import { createObjectLabel, CUSTOM_JSON_PROPS, isSourceObject } from '../../../../document/model';
import { getMutableEditorSelection } from './active-selection';
import {
  commitFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import {
  readEditorDrawingObject,
  translateEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../../../drawing/object/metadata';

async function cloneEditorSelectionObject(args: {
  object: FabricObject;
  nextLabelIndex: (type: string) => number;
  prepareObject: (object: FabricObject) => void;
  frameOrdering: number;
}): Promise<FabricObject> {
  const clone = await args.object.clone([...CUSTOM_JSON_PROPS]);
  clone.set({
    left: (clone.left ?? 0) + 24,
    top: (clone.top ?? 0) + 24,
  });
  clone.sniptaleId = crypto.randomUUID();
  const drawing = readEditorDrawingObject(clone);
  if (drawing) {
    writeEditorDrawingObject(
      clone,
      translateEditorDrawingObject(drawing, { x: 24, y: 24 }, clone.sniptaleId)
    );
  }
  const frameSnapshot = readFrameAnnotationSnapshot(args.object);
  if (frameSnapshot) {
    commitFrameAnnotationProxy(clone, {
      ...frameSnapshot,
      id: clone.sniptaleId,
      ordering: args.frameOrdering,
      x: frameSnapshot.x + 24,
      y: frameSnapshot.y + 24,
    });
  }
  if (args.object.sniptaleRichShape) {
    clone.sniptaleRichShape = {
      ...structuredClone(args.object.sniptaleRichShape),
      id: clone.sniptaleId,
    };
  }
  if (isSourceObject(args.object)) {
    clone.sniptaleType = 'image';
    clone.sniptaleRole = 'annotation';
  }
  convertBackgroundDuplicateToAnnotation(clone);
  clone.sniptaleLabel = createObjectLabel(
    clone.sniptaleType ?? 'image',
    args.nextLabelIndex(clone.sniptaleType ?? 'image')
  );
  args.prepareObject(clone);
  return clone;
}

export async function duplicateEditorSelection(options: {
  canvas: Canvas | null;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: string) => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): Promise<void> {
  const { canvas, prepareObject, nextLabelIndex, commitHistory, syncRuntimeState } = options;
  const activeObjects = getMutableEditorSelection(canvas);
  if (!canvas || !activeObjects) {
    return;
  }

  const clones: FabricObject[] = [];
  let frameOrdering =
    Math.max(
      -1,
      ...(canvas.getObjects?.() ?? activeObjects).map(
        (object) => readFrameAnnotationSnapshot(object)?.ordering ?? -1
      )
    ) + 1;
  for (const object of activeObjects) {
    const clone = await cloneEditorSelectionObject({
      nextLabelIndex,
      object,
      prepareObject,
      frameOrdering,
    });
    if (readFrameAnnotationSnapshot(clone)) frameOrdering += 1;
    canvas.add(clone);
    clones.push(clone);
  }

  const [singleClone] = clones;
  canvas.setActiveObject(
    clones.length === 1 && singleClone ? singleClone : new ActiveSelection(clones, { canvas })
  );
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
