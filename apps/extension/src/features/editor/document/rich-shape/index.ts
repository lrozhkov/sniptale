export {
  EDITOR_BUILT_IN_SHAPE_CATALOG,
  EDITOR_BUILT_IN_SHAPE_CATEGORY,
  EDITOR_RICH_SHAPE_FAMILY,
  EDITOR_RICH_SHAPE_KINDS_BY_FAMILY,
  PRIMARY_BUILT_IN_SHAPE_IDS,
  getEditorBuiltInShapeEntry,
  isValidEditorBuiltInShapeGeometry,
  isEditorKnownRichShapeKind,
  isEditorRichShapeFamily,
  resolveEditorRichShapeFamily,
  searchEditorBuiltInShapes,
} from './catalog/index';
export type {
  EditorBuiltInShapeCapability,
  EditorBuiltInShapeCatalogEntry,
  EditorBuiltInShapeCategory,
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapeId,
  EditorBuiltInShapeInsertDefaults,
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathGeometry,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapePolylineGeometry,
  EditorBuiltInShapeTextFrame,
  EditorBuiltInShapeViewBox,
  EditorKnownRichShapeKind,
  EditorPrimaryBuiltInShapeId,
  EditorRichShapeFamily,
} from './catalog/index';
export type {
  EditorCustomShapeDefinition,
  EditorCustomShapeImportMetadata,
  EditorCustomShapeRichShapeDefaults,
  EditorCustomShapeStoredDefinition,
} from './custom';
export {
  createDefaultRichShapeCalloutGeometry,
  isDynamicRichShapeCallout,
  isEditorRichShapeCalloutSide,
  normalizeRichShapeCalloutGeometry,
  resetRichShapeCalloutTail,
  switchRichShapeCalloutSide,
} from './callout';
export { getRichShapeCalloutSidePoint } from './callout-side-point';
export { createRichShapeCalloutGeometry } from './callout-geometry';
export { resizeRichShapeCalloutGeometry } from './callout-resize';
export {
  DEFAULT_RICH_SHAPE_EFFECTS,
  DEFAULT_RICH_SHAPE_FRAME,
  DEFAULT_RICH_SHAPE_LAYER,
  DEFAULT_RICH_SHAPE_ROUGH,
  DEFAULT_RICH_SHAPE_SOURCE,
  DEFAULT_RICH_SHAPE_STYLE,
  DEFAULT_RICH_SHAPE_TEXT,
  createDefaultRichShapeObject,
} from './defaults';
export { isEditorRichShapeDocumentObject, isEditorRichShapeDocumentObjectArray } from './guards';
export { normalizeEditorDocumentRichShapes, normalizeEditorRichShapeObject } from './normalize';
export {
  createEnabledRichShapeRoughStyle,
  createStableRichShapeRoughSeed,
  resolveRichShapeRoughSeed,
} from './rough';
export { createRichShapeFromLegacyShapeSettings, type LegacyEditorRichShapeKind } from './legacy';
export { EDITOR_RICH_SHAPE_OBJECT_TYPE } from './types';
export type {
  EditorRichShapeArrowhead,
  EditorRichShapeAutofitMode,
  EditorRichShapeCalloutGeometry,
  EditorRichShapeCalloutSide,
  EditorRichShapeDashStyle,
  EditorRichShapeDocumentObject,
  EditorRichShapeEffects,
  EditorRichShapeFill,
  EditorRichShapeFrame,
  EditorRichShapeGradientFill,
  EditorRichShapeHorizontalAlign,
  EditorRichShapeImageFill,
  EditorRichShapeLayerState,
  EditorRichShapeLineCap,
  EditorRichShapeLineJoin,
  EditorRichShapeLineStyle,
  EditorRichShapeObjectType,
  EditorRichShapeRoughFillStyle,
  EditorRichShapeRoughStyle,
  EditorRichShapeSourceMetadata,
  EditorRichShapeStyle,
  EditorRichShapeTextRotationPolicy,
  EditorRichShapeTextState,
  EditorRichShapeVerticalAlign,
  EditorRichShapeWrapMode,
} from './types';
