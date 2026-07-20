import type { FabricObject } from 'fabric';
import { resolveRichShapeCatalogEntry } from './geometry-resolution';
import type { RichShapeGroup } from './types';

export function isRichShapeObject(object: FabricObject): object is RichShapeGroup {
  return object.sniptaleType === 'rich-shape' && Boolean(object.sniptaleRichShape);
}

export function getRichShapeTextCapability(object: FabricObject): object is RichShapeGroup {
  if (!isRichShapeObject(object)) {
    return false;
  }

  const catalogEntry = resolveRichShapeCatalogEntry(object.sniptaleRichShape);
  return catalogEntry?.capabilities.includes('text') ?? true;
}
