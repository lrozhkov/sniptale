import type { EditorRichShapeFamily } from './catalog/families';
import type { EditorBuiltInShapeGeometryDefinition } from './catalog/types';

export const EDITOR_RICH_SHAPE_OBJECT_TYPE = 'rich-shape' as const;

export type EditorRichShapeObjectType = typeof EDITOR_RICH_SHAPE_OBJECT_TYPE;
export type EditorRichShapeDashStyle = 'solid' | 'dash' | 'dot' | 'dash-dot' | 'long-dash';
export type EditorRichShapeLineCap = 'butt' | 'round' | 'square';
export type EditorRichShapeLineJoin = 'miter' | 'round' | 'bevel';
export type EditorRichShapeArrowhead =
  | 'none'
  | 'triangle'
  | 'open'
  | 'stealth'
  | 'diamond'
  | 'oval';
export type EditorRichShapeHorizontalAlign = 'left' | 'center' | 'right' | 'justify';
export type EditorRichShapeVerticalAlign = 'top' | 'middle' | 'bottom';
export type EditorRichShapeAutofitMode = 'none' | 'shrink-text' | 'resize-shape';
export type EditorRichShapeWrapMode = 'wrap' | 'overflow' | 'clip';
export type EditorRichShapeTextRotationPolicy = 'shape' | 'upright' | 'fixed';
export type EditorRichShapeRoughFillStyle =
  | 'hachure'
  | 'solid'
  | 'zigzag'
  | 'cross-hatch'
  | 'dots'
  | 'dashed'
  | 'zigzag-line';

export interface EditorRichShapeFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type EditorRichShapeCalloutSide = 'top' | 'right' | 'bottom' | 'left';

export interface EditorRichShapeCalloutGeometry {
  body: EditorRichShapeFrame;
  tail: {
    side: EditorRichShapeCalloutSide;
    baseStartRatio: number;
    baseEndRatio: number;
    tip: { x: number; y: number };
  };
}

export interface EditorRichShapeGradientFill {
  type: 'gradient';
  gradientType: 'linear' | 'radial';
  angle: number;
  stops: Array<{ color: string; offset: number; transparency: number }>;
}

export interface EditorRichShapeImageFill {
  type: 'image' | 'pattern';
  assetId: string | null;
  fit: 'cover' | 'contain' | 'stretch' | 'tile';
}

export type EditorRichShapeFill =
  | { type: 'solid'; color: string }
  | EditorRichShapeGradientFill
  | EditorRichShapeImageFill;

export interface EditorRichShapeLineStyle {
  color: string;
  transparency: number;
  width: number;
  dashStyle: EditorRichShapeDashStyle;
  cap: EditorRichShapeLineCap;
  join: EditorRichShapeLineJoin;
  beginArrowhead: EditorRichShapeArrowhead;
  endArrowhead: EditorRichShapeArrowhead;
}

export interface EditorRichShapeStyle {
  fill: EditorRichShapeFill;
  fillTransparency: number;
  line: EditorRichShapeLineStyle;
  opacity: number;
  cornerRadius: number;
}

interface EditorRichShapeShadowEffect {
  enabled: boolean;
  color: string;
  opacity: number;
  blur: number;
  angle: number;
  distance: number;
}

export interface EditorRichShapeEffects {
  shadow: EditorRichShapeShadowEffect;
  reflection: { enabled: boolean; opacity: number; distance: number; size: number };
  glow: { enabled: boolean; color: string; opacity: number; radius: number };
  softEdge: { enabled: boolean; radius: number };
}

export interface EditorRichShapeTextState {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  strike: boolean;
  color: string;
  insets: { top: number; right: number; bottom: number; left: number };
  horizontalAlign: EditorRichShapeHorizontalAlign;
  verticalAlign: EditorRichShapeVerticalAlign;
  autofit: EditorRichShapeAutofitMode;
  wrap: EditorRichShapeWrapMode;
  rotationPolicy: EditorRichShapeTextRotationPolicy;
}

export interface EditorRichShapeRoughStyle {
  enabled: boolean;
  seed: number | null;
  roughness: number;
  bowing: number;
  fillStyle: EditorRichShapeRoughFillStyle;
  fillColor?: string;
  hachureGap: number;
  hachureAngle: number;
  fillWeight: number;
  fillRoughness: number;
  fillBowing: number;
  fillTransparency: number;
  preserveVertices: boolean;
}

export interface EditorRichShapeSourceMetadata {
  type:
    | 'built-in'
    | 'custom'
    | 'manual-excalidraw-import'
    | 'excalidraw-library'
    | 'excalidraw-export'
    | 'unknown';
  name: string | null;
  libraryId: string | null;
  itemId: string | null;
  importedAt: string | null;
  formatVersion: string | null;
}

export interface EditorRichShapeLayerState {
  visible: boolean;
  locked: boolean;
  zIndex: number | null;
}

export interface EditorRichShapeDocumentObject {
  id: string;
  objectType: EditorRichShapeObjectType;
  shapeFamily: EditorRichShapeFamily;
  shapeKind: string;
  frame: EditorRichShapeFrame;
  rotation: number;
  scaleX: number;
  scaleY: number;
  style: EditorRichShapeStyle;
  effects: EditorRichShapeEffects;
  text: EditorRichShapeTextState;
  rough: EditorRichShapeRoughStyle;
  geometry?: EditorBuiltInShapeGeometryDefinition;
  callout?: EditorRichShapeCalloutGeometry;
  source?: EditorRichShapeSourceMetadata;
  layer: EditorRichShapeLayerState;
}
