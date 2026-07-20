import { EDITOR_RICH_SHAPE_FAMILY } from './catalog/families';
import { EDITOR_RICH_SHAPE_OBJECT_TYPE } from './types';
import type {
  EditorRichShapeDocumentObject,
  EditorRichShapeEffects,
  EditorRichShapeLayerState,
  EditorRichShapeRoughStyle,
  EditorRichShapeSourceMetadata,
  EditorRichShapeStyle,
  EditorRichShapeTextState,
} from './types';

export const DEFAULT_RICH_SHAPE_FRAME = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
} as const;

export const DEFAULT_RICH_SHAPE_STYLE: EditorRichShapeStyle = {
  fill: { type: 'solid', color: '#ffffff' },
  fillTransparency: 0,
  line: {
    color: '#111827',
    transparency: 0,
    width: 2,
    dashStyle: 'solid',
    cap: 'round',
    join: 'round',
    beginArrowhead: 'none',
    endArrowhead: 'none',
  },
  opacity: 1,
  cornerRadius: 0,
};

export const DEFAULT_RICH_SHAPE_EFFECTS: EditorRichShapeEffects = {
  shadow: {
    enabled: false,
    color: '#000000',
    opacity: 0,
    blur: 12,
    angle: 45,
    distance: 4,
  },
  reflection: { enabled: false, opacity: 0, distance: 0, size: 0.25 },
  glow: { enabled: false, color: '#ffffff', opacity: 0, radius: 0 },
  softEdge: { enabled: false, radius: 0 },
};

export const DEFAULT_RICH_SHAPE_TEXT: EditorRichShapeTextState = {
  content: '',
  fontFamily: 'Sniptale Sans',
  fontSize: 16,
  fontWeight: 'normal',
  fontStyle: 'normal',
  underline: false,
  strike: false,
  color: '#111827',
  insets: { top: 8, right: 8, bottom: 8, left: 8 },
  horizontalAlign: 'center',
  verticalAlign: 'middle',
  autofit: 'none',
  wrap: 'wrap',
  rotationPolicy: 'shape',
};

export const DEFAULT_RICH_SHAPE_ROUGH: EditorRichShapeRoughStyle = {
  enabled: false,
  seed: null,
  roughness: 1,
  bowing: 1,
  fillStyle: 'hachure',
  fillColor: '#ffffff',
  hachureGap: 8,
  hachureAngle: -41,
  fillWeight: 1,
  fillRoughness: 1,
  fillBowing: 1,
  fillTransparency: 0,
  preserveVertices: true,
};

export const DEFAULT_RICH_SHAPE_SOURCE: EditorRichShapeSourceMetadata = {
  type: 'built-in',
  name: null,
  libraryId: null,
  itemId: null,
  importedAt: null,
  formatVersion: null,
};

export const DEFAULT_RICH_SHAPE_LAYER: EditorRichShapeLayerState = {
  visible: true,
  locked: false,
  zIndex: null,
};

export function createDefaultRichShapeObject(
  overrides: Partial<EditorRichShapeDocumentObject> = {}
): EditorRichShapeDocumentObject {
  return {
    id: overrides.id ?? '',
    objectType: EDITOR_RICH_SHAPE_OBJECT_TYPE,
    shapeFamily: overrides.shapeFamily ?? EDITOR_RICH_SHAPE_FAMILY.OFFICE,
    shapeKind: overrides.shapeKind ?? 'rectangle',
    frame: { ...DEFAULT_RICH_SHAPE_FRAME, ...overrides.frame },
    rotation: overrides.rotation ?? 0,
    scaleX: overrides.scaleX ?? 1,
    scaleY: overrides.scaleY ?? 1,
    style: overrides.style ?? DEFAULT_RICH_SHAPE_STYLE,
    effects: overrides.effects ?? DEFAULT_RICH_SHAPE_EFFECTS,
    text: overrides.text ?? DEFAULT_RICH_SHAPE_TEXT,
    rough: overrides.rough ?? DEFAULT_RICH_SHAPE_ROUGH,
    ...(overrides.geometry === undefined ? {} : { geometry: overrides.geometry }),
    ...(overrides.callout === undefined ? {} : { callout: overrides.callout }),
    source: overrides.source ?? DEFAULT_RICH_SHAPE_SOURCE,
    layer: overrides.layer ?? DEFAULT_RICH_SHAPE_LAYER,
  };
}
