import type {
  EditorRichShapeDocumentObject,
  EditorRichShapeCalloutGeometry,
  EditorRichShapeEffects,
  EditorRichShapeFill,
  EditorRichShapeFrame,
  EditorRichShapeLineStyle,
  EditorRichShapeRoughStyle,
  EditorRichShapeTextState,
} from '../../../features/editor/document/rich-shape';

export interface EditorRichShapeFormattingPatch {
  callout?: EditorRichShapeCalloutGeometry;
  effects?: {
    reflection?: Partial<EditorRichShapeEffects['reflection']>;
    shadow?: Partial<EditorRichShapeEffects['shadow']>;
  };
  frame?: Partial<EditorRichShapeFrame>;
  layer?: Partial<EditorRichShapeDocumentObject['layer']>;
  rough?: Partial<EditorRichShapeRoughStyle>;
  rotation?: number;
  style?: {
    cornerRadius?: number;
    fill?: EditorRichShapeFill;
    fillTransparency?: number;
    line?: Partial<EditorRichShapeLineStyle>;
    opacity?: number;
  };
  text?: Partial<Omit<EditorRichShapeTextState, 'insets'>> & {
    insets?: Partial<EditorRichShapeTextState['insets']>;
  };
}
