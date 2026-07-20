import type { BlurSettings } from '../../highlighter/contracts';
import type { EditorBrushSettings } from './brush-types';
import type { EditorCalloutSettings } from './callout-types';
import type { EditorImageSettings } from './image-types';
import type { EditorLineSettings } from './line-types';
import type { EditorStepSettings } from './step-types';
import type { EditorArrowSettings, EditorShapeSettings, EditorTextSettings } from './types';

export interface EditorToolSettings {
  pencil: EditorBrushSettings;
  highlighter: EditorBrushSettings;
  rectangle: EditorShapeSettings;
  ellipse: EditorShapeSettings;
  blur: BlurSettings;
  arrow: EditorArrowSettings;
  line: EditorLineSettings;
  callout: EditorCalloutSettings;
  text: EditorTextSettings;
  step: EditorStepSettings;
  image: EditorImageSettings;
}
