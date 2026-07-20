import type { Canvas, FabricObject } from 'fabric';
import { createEnabledRichShapeRoughStyle } from '../../../features/editor/document/rich-shape';
import { normalizeEditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape/custom';

import type { SourceState } from '../../document/model/source-state';
import { applyRichShapeDocumentObjectToObject, isRichShapeObject } from '../../objects/rich-shape';
import { createRichShapeCatalogInsertionObject } from '../tools/insertions';
import { createCustomRichShapeInsertionObject } from '../tools/custom-rich-shape-insertion';

export function insertEditorRichShapeObject(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  shapeId: string;
  rough?: boolean;
  customDefinition?: unknown;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: 'rich-shape') => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const {
    canvas,
    source,
    shapeId,
    customDefinition,
    prepareObject,
    nextLabelIndex,
    commitHistory,
    syncRuntimeState,
  } = options;
  if (!canvas || !source) {
    return;
  }

  const object = createRichShapeInsertionObject({
    customDefinition,
    nextLabelIndex: nextLabelIndex('rich-shape'),
    prepareObject,
    shapeId,
    source,
  });
  if (!object) {
    return;
  }
  if (options.rough && isRichShapeObject(object)) {
    applyRoughRichShapeDefaults(object, customDefinition);
  }

  canvas.add(object);
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}

function createRichShapeInsertionObject(args: {
  customDefinition: unknown;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
  shapeId: string;
  source: SourceState;
}) {
  const insertionOptions = {
    nextLabelIndex: args.nextLabelIndex,
    prepareObject: args.prepareObject,
    shapeId: args.shapeId,
    source: args.source,
  };
  return args.customDefinition
    ? createCustomRichShapeInsertionObject({
        ...insertionOptions,
        customDefinition: args.customDefinition,
      })
    : createRichShapeCatalogInsertionObject(insertionOptions);
}

function applyRoughRichShapeDefaults(object: FabricObject, customDefinition: unknown): void {
  if (!isRichShapeObject(object)) {
    return;
  }
  const definition = normalizeEditorCustomShapeDefinition(customDefinition);
  applyRichShapeDocumentObjectToObject(object, {
    ...object.sniptaleRichShape,
    rough: {
      ...createEnabledRichShapeRoughStyle(object.sniptaleRichShape.id),
      ...definition?.roughDefaults,
    },
  });
}
