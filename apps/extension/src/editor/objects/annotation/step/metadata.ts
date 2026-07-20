import type { Group } from 'fabric';
import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';

export function assignStepMetadata(group: Group, settings: StepSettings): void {
  group.sniptaleStepValue = settings.value;
  group.sniptaleStepType = settings.type;
  group.sniptaleStepAlphabet = settings.alphabet;
  group.sniptaleStepSizeLevel = settings.sizeLevel;
  group.sniptaleStepColor = settings.color;
  group.sniptaleStepOpacity = settings.opacity;
  group.sniptaleStepTextColor = settings.textColor;
  group.sniptaleStepStrokeColor = settings.strokeColor;
  group.sniptaleStepStrokeOpacity = settings.strokeOpacity;
  group.sniptaleStepStrokeWidth = settings.strokeWidth;
}
