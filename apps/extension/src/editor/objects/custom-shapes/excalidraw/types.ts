import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeArrowhead,
  EditorRichShapeFamily,
  EditorRichShapeStyle,
  EditorRichShapeTextState,
} from '../../../../features/editor/document/rich-shape';

export type ExcalidrawImportDocumentKind = 'library' | 'export';

export interface ExcalidrawElementModel {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string | null;
  backgroundColor: string | null;
  fillStyle: string | null;
  strokeWidth: number | null;
  strokeStyle: string | null;
  roughness: number | null;
  opacity: number | null;
  seed: number | null;
  groupIds: readonly string[];
  points: readonly (readonly [number, number])[];
  startArrowhead: EditorRichShapeArrowhead | null;
  endArrowhead: EditorRichShapeArrowhead | null;
  text: string | null;
  fontSize: number | null;
  textAlign: string | null;
  verticalAlign: string | null;
  containerId: string | null;
}

export interface ExcalidrawMappedElement {
  element: ExcalidrawElementModel;
  geometry: EditorBuiltInShapeGeometryDefinition;
  bounds: { left: number; top: number; width: number; height: number };
  shapeFamily: EditorRichShapeFamily;
  shapeKind: string;
  style: EditorRichShapeStyle;
  text: EditorRichShapeTextState | null;
}

export interface ExcalidrawImportItemModel {
  id: string | null;
  name: string | null;
  category: string | null;
  tags: readonly string[];
  elements: readonly ExcalidrawElementModel[];
}

export interface ExcalidrawImportDocumentModel {
  kind: ExcalidrawImportDocumentKind;
  fileName: string;
  libraryId: string | null;
  libraryName: string | null;
  version: string | null;
  items: readonly ExcalidrawImportItemModel[];
}
