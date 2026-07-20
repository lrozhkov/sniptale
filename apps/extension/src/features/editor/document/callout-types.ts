import type { EditorRichShapeCalloutSide } from './rich-shape/types';
import type { EditorShapeSettings, EditorTextSettings } from './types';

export interface EditorCalloutSettings {
  style: EditorShapeSettings;
  text: EditorTextSettings;
  tailSide: EditorRichShapeCalloutSide;
}
