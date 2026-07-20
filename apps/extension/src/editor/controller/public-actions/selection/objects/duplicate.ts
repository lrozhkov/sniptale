import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';

import { convertBackgroundDuplicateToAnnotation } from '../../../background';
import { createObjectLabel, CUSTOM_JSON_PROPS, isSourceObject } from '../../../../document/model';
import { getMutableEditorSelection } from './active-selection';

async function cloneEditorSelectionObject(args: {
  object: FabricObject;
  nextLabelIndex: (type: string) => number;
  prepareObject: (object: FabricObject) => void;
}): Promise<FabricObject> {
  const clone = await args.object.clone([...CUSTOM_JSON_PROPS]);
  clone.set({
    left: (clone.left ?? 0) + 24,
    top: (clone.top ?? 0) + 24,
  });
  clone.sniptaleId = crypto.randomUUID();
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
  for (const object of activeObjects) {
    const clone = await cloneEditorSelectionObject({ nextLabelIndex, object, prepareObject });
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
