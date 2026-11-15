import { ActiveSelection, Group, util, type Canvas, type FabricObject } from 'fabric';

import { convertBackgroundDuplicateToAnnotation } from '../../../background';
import { createObjectLabel, CUSTOM_JSON_PROPS, isSourceObject } from '../../../../document/model';
import { parseScenarioBlurMetadata } from '../../../../document/scenario-blur-metadata';
import { getMutableEditorSelection } from './active-selection';
import { bindClonedVectorResources, collectSelectionVectorDefinitions } from './vector-resources';
import {
  commitFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import {
  readEditorDrawingObject,
  translateEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../../../drawing/object/metadata';

function refreshScenarioBlurIdentity(object: FabricObject): void {
  const metadata = parseScenarioBlurMetadata(object.sniptaleScenarioBlurJson);
  if (metadata) {
    object.sniptaleScenarioBlurJson = JSON.stringify({
      version: 1,
      ...metadata,
      id: object.sniptaleId,
    });
  }
}

/** Assign independent identities to a cloned selection and its logical descendants. */
export function refreshEditorCloneIdentities(object: FabricObject): string {
  object.sniptaleId = crypto.randomUUID();
  refreshScenarioBlurIdentity(object);
  const drawing = readEditorDrawingObject(object);
  if (drawing) writeEditorDrawingObject(object, { ...drawing, id: object.sniptaleId });
  const frame = readFrameAnnotationSnapshot(object);
  if (frame) commitFrameAnnotationProxy(object, { ...frame, id: object.sniptaleId });
  if (object.sniptaleRichShape)
    object.sniptaleRichShape = {
      ...structuredClone(object.sniptaleRichShape),
      id: object.sniptaleId,
    };
  if (object instanceof Group && object.sniptaleType === 'group')
    object.getObjects().forEach(refreshEditorCloneIdentities);
  return object.sniptaleId;
}

async function cloneEditorSelectionObject(args: {
  object: FabricObject;
  nextLabelIndex: (type: string) => number;
  prepareObject: (object: FabricObject) => void;
  frameOrdering: number;
}): Promise<FabricObject> {
  const clone = await args.object.clone([...CUSTOM_JSON_PROPS]);
  if (args.object.group || args.object.parent)
    util.applyTransformToObject(clone, args.object.calcTransformMatrix());
  clone.set({
    left: (clone.left ?? 0) + 24,
    top: (clone.top ?? 0) + 24,
  });
  const cloneId = refreshEditorCloneIdentities(clone);
  const drawing = readEditorDrawingObject(clone);
  if (drawing) {
    writeEditorDrawingObject(
      clone,
      translateEditorDrawingObject(drawing, { x: 24, y: 24 }, cloneId)
    );
  }
  const frameSnapshot = readFrameAnnotationSnapshot(args.object);
  if (frameSnapshot) {
    commitFrameAnnotationProxy(clone, {
      ...frameSnapshot,
      id: cloneId,
      ordering: args.frameOrdering,
      x: frameSnapshot.x + 24,
      y: frameSnapshot.y + 24,
    });
  }
  if (args.object.sniptaleRichShape) {
    clone.sniptaleRichShape = {
      ...structuredClone(args.object.sniptaleRichShape),
      id: cloneId,
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
  isCurrent?: () => boolean;
}): Promise<void> {
  const { canvas, prepareObject, nextLabelIndex, commitHistory, syncRuntimeState } = options;
  const activeObjects = getMutableEditorSelection(canvas);
  if (!canvas || !activeObjects) {
    return;
  }
  const definitions = collectSelectionVectorDefinitions(canvas, activeObjects);

  const parent = activeObjects[0]?.parent;
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
    clones.push(clone);
  }
  await bindClonedVectorResources(clones, definitions);
  if (
    options.isCurrent?.() === false ||
    canvas.getActiveObjects().length !== activeObjects.length ||
    activeObjects.some((object, index) => canvas.getActiveObjects()[index] !== object)
  ) {
    clones.forEach((clone) => clone.dispose?.());
    return;
  }

  if (parent) {
    let root: FabricObject = parent;
    while (true) {
      if (root.sniptaleLocked || root.visible === false) return;
      if (!root.parent) break;
      if (!root.parent.getObjects().includes(root)) return;
      root = root.parent;
    }
    if (
      !canvas.getObjects().includes(root) ||
      activeObjects.some((object) => object.parent !== parent)
    )
      return;
  }
  clones.forEach((clone) => (parent ?? canvas).add(clone));
  const [singleClone] = clones;
  canvas.setActiveObject(
    clones.length === 1 && singleClone ? singleClone : new ActiveSelection(clones, { canvas })
  );
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
