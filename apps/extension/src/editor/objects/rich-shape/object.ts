import { FixedLayout, Group, LayoutManager } from 'fabric';
import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { createObjectLabel } from '../../document/model';
import { createRichShapeCalloutControls } from './callout-controls/factory';
import { exportRichShapeDocumentObjectFromGroup } from './document-export';
import { createRichShapeGeometryObjects } from './geometry';
import { applyRichShapeDocumentObjectToObject } from './mutation/apply';
import { resolveRichShapeGeometry } from './geometry-resolution';
import type { RichShapeGroup } from './types';

function cloneRichShape(shape: EditorRichShapeDocumentObject): EditorRichShapeDocumentObject {
  return structuredClone(shape);
}

export function createRichShapeObject(
  shape: EditorRichShapeDocumentObject,
  geometry?: EditorBuiltInShapeGeometryDefinition,
  label?: string
): RichShapeGroup | null {
  const resolvedGeometry = resolveRichShapeGeometry(shape, geometry);
  if (!resolvedGeometry) {
    return null;
  }

  const documentShape = cloneRichShape(shape);
  const group = new Group(createRichShapeGeometryObjects(documentShape, resolvedGeometry), {
    angle: documentShape.rotation,
    left: documentShape.frame.left,
    layoutManager: new LayoutManager(new FixedLayout()),
    objectCaching: false,
    opacity: documentShape.style.opacity,
    originX: 'left',
    originY: 'top',
    scaleX: documentShape.scaleX,
    scaleY: documentShape.scaleY,
    top: documentShape.frame.top,
    visible: documentShape.layer.visible,
  }) as RichShapeGroup;

  group.sniptaleId = documentShape.id;
  group.sniptaleType = 'rich-shape';
  group.sniptaleRole = 'annotation';
  group.sniptaleLabel = label ?? documentShape.source?.name ?? createObjectLabel('rich-shape', 1);
  group.sniptaleLocked = documentShape.layer.locked;
  group.sniptaleRichShape = documentShape;
  if (documentShape.source?.itemId) {
    group.sniptaleRichShapeCatalogId = documentShape.source.itemId;
  }
  group.set({ height: documentShape.frame.height, width: documentShape.frame.width });
  group.controls = createRichShapeCalloutControls(group, applyRichShapeDocumentObjectToObject);
  return group;
}

export function exportRichShapeDocumentObject(
  object: RichShapeGroup
): EditorRichShapeDocumentObject {
  return exportRichShapeDocumentObjectFromGroup(object);
}
