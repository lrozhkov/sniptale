import type { Group } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';

export type RichShapeGroup = Group & {
  sniptaleRichShape: EditorRichShapeDocumentObject;
  sniptaleRichShapeCatalogId?: string;
};
