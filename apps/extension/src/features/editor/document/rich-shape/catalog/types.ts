import type { TranslationKey } from '../../../../../platform/i18n/types';
import type { EditorRichShapeFamily } from './families';

export const EDITOR_BUILT_IN_SHAPE_CATEGORY = {
  PRIMARY: 'primary-shortcuts',
  LINES: 'lines-connectors',
  BASIC: 'basic-shapes',
  BLOCK_ARROWS: 'block-arrows',
  EQUATION: 'equation-shapes',
  FLOWCHART: 'flowchart',
  CALLOUTS: 'callouts',
  STARS_BANNERS: 'stars-banners',
  ACTION_BUTTONS: 'action-buttons',
} as const;

export type EditorBuiltInShapeCategory =
  (typeof EDITOR_BUILT_IN_SHAPE_CATEGORY)[keyof typeof EDITOR_BUILT_IN_SHAPE_CATEGORY];

export type EditorBuiltInShapeCapability = 'text' | 'fill' | 'line' | 'effects' | 'connectors';

export type EditorBuiltInShapePathCommand =
  | readonly ['M' | 'L', number, number]
  | readonly ['Q', number, number, number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['A', number, number, number, 0 | 1, 0 | 1, number, number]
  | readonly ['Z'];

export interface EditorBuiltInShapeViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface EditorBuiltInShapeTextFrame {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface EditorBuiltInShapePathPrimitive {
  commands: readonly EditorBuiltInShapePathCommand[];
  fillRule?: 'nonzero' | 'evenodd';
}

export interface EditorBuiltInShapePathGeometry {
  type: 'path';
  viewBox: EditorBuiltInShapeViewBox;
  textFrame?: EditorBuiltInShapeTextFrame;
  paths: readonly EditorBuiltInShapePathPrimitive[];
}

export interface EditorBuiltInShapePolylineGeometry {
  type: 'polyline';
  viewBox: EditorBuiltInShapeViewBox;
  textFrame?: EditorBuiltInShapeTextFrame;
  points: readonly (readonly [number, number])[];
  closed: boolean;
}

export type EditorBuiltInShapeGeometryDefinition =
  | EditorBuiltInShapePathGeometry
  | EditorBuiltInShapePolylineGeometry;

interface EditorBuiltInShapeFrameDefaults {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface EditorBuiltInShapeStyleDefaults {
  fillColor: string;
  fillTransparency: number;
  lineColor: string;
  lineWidth: number;
  opacity: number;
  cornerRadius: number;
}

interface EditorBuiltInShapeTextDefaults {
  content: string;
  fontSize: number;
  horizontalAlign: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
}

interface EditorBuiltInShapeEffectDefaults {
  shadowEnabled: boolean;
}

export interface EditorBuiltInShapeInsertDefaults {
  shapeFamily: EditorRichShapeFamily;
  shapeKind: string;
  frame: EditorBuiltInShapeFrameDefaults;
  style: EditorBuiltInShapeStyleDefaults;
  text: EditorBuiltInShapeTextDefaults;
  effects: EditorBuiltInShapeEffectDefaults;
}

export interface EditorBuiltInShapeCatalogEntry {
  id: string;
  labelKey: TranslationKey;
  labelFallback: string;
  category: EditorBuiltInShapeCategory;
  tags: readonly string[];
  searchAliases: readonly string[];
  compatibilityIds?: readonly string[];
  thumbnail: EditorBuiltInShapeGeometryDefinition;
  insertDefaults: EditorBuiltInShapeInsertDefaults;
  capabilities: readonly EditorBuiltInShapeCapability[];
  geometry: EditorBuiltInShapeGeometryDefinition;
}
