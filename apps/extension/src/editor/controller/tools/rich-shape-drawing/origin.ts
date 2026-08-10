import type { FabricObject } from 'fabric';

type RichShapeToolOrigin = 'shape';

type RichShapeToolOriginObject = FabricObject & {
  sniptaleRichShapeToolOrigin?: RichShapeToolOrigin;
};

export function markRichShapeToolOrigin(object: FabricObject, origin: RichShapeToolOrigin): void {
  (object as RichShapeToolOriginObject).sniptaleRichShapeToolOrigin = origin;
}

export function clearRichShapeToolOrigin(object: FabricObject): void {
  delete (object as RichShapeToolOriginObject).sniptaleRichShapeToolOrigin;
}
