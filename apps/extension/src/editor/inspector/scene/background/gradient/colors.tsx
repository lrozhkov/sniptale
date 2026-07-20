import type React from 'react';

import { GradientColorControls } from './controls';
import type { EditorInspectorFrameBackgroundGradientColorControlsProps } from './types';

export function EditorInspectorFrameBackgroundGradientColorControls(
  props: EditorInspectorFrameBackgroundGradientColorControlsProps
): React.ReactElement {
  return (
    <GradientColorControls
      applyFramePatch={props.applyFramePatch}
      frameBackgroundPalette={props.frameBackgroundPalette}
      frameDraft={props.frameDraft}
      previewFramePatch={props.previewFramePatch}
      recentColors={props.recentColors}
    />
  );
}
