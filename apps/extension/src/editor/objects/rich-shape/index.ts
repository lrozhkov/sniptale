export type { RichShapeGroup } from './types';
export { getRichShapeTextCapability, isRichShapeObject } from './guards';
export { createRichShapeObject, exportRichShapeDocumentObject } from './object';
export { createRichShapeCatalogObject } from './catalog-object';
export { applyRichShapeDocumentObjectToObject } from './mutation/apply';
export { normalizeScaledRichShapeObject, resizeRichShapeObjectToBounds } from './mutation/resize';
