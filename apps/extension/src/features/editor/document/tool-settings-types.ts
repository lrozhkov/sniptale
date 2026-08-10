import type { DrawingToolDefaults } from '../../drawing/public';
import type { EditorImageSettings } from './image-types';
import type { EditorStepSettings } from './step-types';

export interface EditorToolSettings extends DrawingToolDefaults {
  step: EditorStepSettings;
  image: EditorImageSettings;
}
