import type React from 'react';

import { GradientPresetGrid } from './controls';
import type { EditorInspectorFrameBackgroundGradientPresetGridProps } from './types';

export function EditorInspectorFrameBackgroundGradientPresetGrid(
  props: EditorInspectorFrameBackgroundGradientPresetGridProps
): React.ReactElement {
  return (
    <GradientPresetGrid
      applyGradientPreset={props.applyGradientPreset}
      frameDraft={props.frameDraft}
      gradientPresets={props.gradientPresets}
    />
  );
}
