import type React from 'react';
import type { EditorInspectorFrameBackgroundGradientEditorProps } from './types';
import { EditorInspectorFrameBackgroundGradientColorControls } from './colors';
import { EditorInspectorFrameBackgroundGradientPresetGrid } from './presets';

export function EditorInspectorFrameBackgroundGradientEditor(
  props: EditorInspectorFrameBackgroundGradientEditorProps
): React.ReactElement {
  return (
    <div className="space-y-3">
      <EditorInspectorFrameBackgroundGradientPresetGrid
        applyGradientPreset={props.applyGradientPreset}
        frameDraft={props.frameDraft}
        gradientPresets={props.gradientPresets}
      />
      <EditorInspectorFrameBackgroundGradientColorControls
        applyFramePatch={props.applyFramePatch}
        frameBackgroundPalette={props.frameBackgroundPalette}
        frameDraft={props.frameDraft}
        previewFramePatch={props.previewFramePatch}
        recentColors={props.recentColors}
      />
    </div>
  );
}
