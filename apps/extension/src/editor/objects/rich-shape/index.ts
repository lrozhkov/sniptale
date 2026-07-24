export type { RichShapeGroup } from './types';
export { getRichShapeTextCapability, isRichShapeObject } from './guards';
export { createRichShapeObject, exportRichShapeDocumentObject } from './object';
export { createRichShapeCatalogObject } from './catalog-object';
export { createRichShapeCalloutObject } from './callout-object';
export { applyRichShapeDocumentObjectToObject } from './mutation/apply';
export { normalizeScaledRichShapeObject, resizeRichShapeObjectToBounds } from './mutation/resize';
export { updateRichShapeObjectStyle } from './mutation/style-update';
