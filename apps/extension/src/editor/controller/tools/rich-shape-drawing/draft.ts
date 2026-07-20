import type { FabricObject, Point } from 'fabric';
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import type { EditorRichShapeToolSelection } from '../../../state/types';
import { createRichShapeCatalogObject } from '../../../objects/rich-shape';

import type { SourceState } from '../../../document/model/source-state';
import { createCustomRichShapeInsertionObject } from '../custom-rich-shape-insertion';

function createCatalogRichShapeDraft(options: {
  point: Point;
  prepareObject: (object: FabricObject) => void;
  selection: EditorRichShapeToolSelection;
  nextLabelIndex: (type: 'rich-shape') => number;
}): FabricObject | null {
  const entry = getEditorBuiltInShapeEntry(options.selection.shapeId);
  if (!entry) {
    return null;
  }

  const object = createRichShapeCatalogObject({
    entry,
    height: 1,
    id: crypto.randomUUID(),
    labelIndex: options.nextLabelIndex('rich-shape'),
    left: options.point.x,
    rough: options.selection.rough,
    top: options.point.y,
    width: 1,
  });
  options.prepareObject(object);
  return object;
}

function createCustomRichShapeDraft(options: {
  point: Point;
  prepareObject: (object: FabricObject) => void;
  selection: EditorRichShapeToolSelection;
  source: SourceState;
  nextLabelIndex: (type: 'rich-shape') => number;
}): FabricObject | null {
  return createCustomRichShapeInsertionObject({
    customDefinition: options.selection.customDefinition,
    height: 1,
    left: options.point.x,
    nextLabelIndex: options.nextLabelIndex('rich-shape'),
    prepareObject: options.prepareObject,
    rough: options.selection.rough,
    shapeId: options.selection.shapeId,
    source: options.source,
    top: options.point.y,
    width: 1,
  });
}

export function createRichShapeToolDraft(options: {
  point: Point;
  prepareObject: (object: FabricObject) => void;
  selection: EditorRichShapeToolSelection;
  source: SourceState;
  nextLabelIndex: (type: 'rich-shape') => number;
}): { object: FabricObject; tool: 'rich-shape' } | null {
  const object = options.selection.customDefinition
    ? createCustomRichShapeDraft(options)
    : createCatalogRichShapeDraft(options);
  return object ? { object, tool: 'rich-shape' } : null;
}
