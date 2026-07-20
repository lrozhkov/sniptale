import type { Group } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';

export type RichShapeCalloutGroup = Group & {
  sniptaleRichShape: EditorRichShapeDocumentObject;
};

export type UpdateRichShapeCallout = (
  object: RichShapeCalloutGroup,
  shape: EditorRichShapeDocumentObject
) => boolean;

export type CalloutControlKey = 'baseStart' | 'baseEnd' | 'tip';
