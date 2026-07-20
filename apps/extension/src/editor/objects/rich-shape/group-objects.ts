import type { FabricObject, Group } from 'fabric';
import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { createRichShapeGeometryObjects } from './geometry';

type MutableGroupChildren = Group & {
  _objects: FabricObject[];
  enterGroup: (object: FabricObject, removeParentTransform?: boolean) => void;
};

export function replaceRichShapeGroupObjects(
  group: Group,
  shape: EditorRichShapeDocumentObject,
  geometry: EditorBuiltInShapeGeometryDefinition
): void {
  const currentObjects = group.getObjects();
  if (currentObjects.length > 0) {
    group.remove(...currentObjects);
  }
  const mutableGroup = group as MutableGroupChildren;
  const nextObjects = createRichShapeGeometryObjects(shape, geometry);
  // Fabric's public add() treats incoming children as canvas-plane objects; these are already
  // authored in the group's local plane so rich-shape geometry stays aligned with its frame.
  mutableGroup._objects = [];
  nextObjects.forEach((object) => {
    mutableGroup._objects.push(object);
    mutableGroup.enterGroup(object, false);
  });
  group.set({ dirty: true, height: shape.frame.height, width: shape.frame.width });
}
