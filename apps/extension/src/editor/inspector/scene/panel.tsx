import { EditorInspectorPresetHeader } from '../presets';
import { EditorInspectorFrameBackgroundFillEditor } from './background';
import { EditorInspectorFrameBackgroundSection } from './placement/background';
import { EditorInspectorFramePlacementSection } from './placement';
import { FramePaddingSection } from './padding';
import { FrameApplyButton } from './apply-button';
import { EditorInspectorFramePreviewCard } from './preview/card';
import type { EditorInspectorFramePanelProps } from './types';

function createFramePanelControls(props: EditorInspectorFramePanelProps) {
  return [
    <EditorInspectorFrameBackgroundSection
      key="background-mode"
      frameBackgroundModeOptions={props.frameBackgroundModeOptions}
      frameDraft={props.frameDraft}
      setBackgroundMode={props.setBackgroundMode}
    />,
    <EditorInspectorFramePreviewCard
      key="preview"
      backgroundPreviewStyle={props.backgroundPreviewStyle}
    />,
    <EditorInspectorFrameBackgroundFillEditor
      key="background-fill"
      applyFramePatch={props.applyFramePatch}
      applyGradientPreset={props.applyGradientPreset}
      frameBackgroundImageFitOptions={props.frameBackgroundImageFitOptions}
      frameBackgroundPalette={props.frameBackgroundPalette}
      frameDraft={props.frameDraft}
      gradientPresets={props.gradientPresets}
      onClearBackgroundImage={props.onClearBackgroundImage}
      onPickBackgroundImage={props.onPickBackgroundImage}
      previewFramePatch={props.previewFramePatch}
      recentColors={props.recentColors}
      toNumber={props.toNumber}
    />,
    <EditorInspectorFramePlacementSection
      key="placement"
      frameDraft={props.frameDraft}
      frameLayoutModeOptions={props.frameLayoutModeOptions}
      setLayoutMode={props.setLayoutMode}
    />,
    <FramePaddingSection
      key="padding"
      frameDraft={props.frameDraft}
      framePaddingSummary={props.framePaddingSummary}
      setFrameDraft={props.setFrameDraft}
    />,
    <FrameApplyButton key="apply" onApplyFrame={props.onApplyFrame} />,
  ];
}

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  const controls = createFramePanelControls(props);

  return (
    <div className="space-y-3">
      {props.scenePresetHeader ? (
        <EditorInspectorPresetHeader state={props.scenePresetHeader}>
          {controls}
        </EditorInspectorPresetHeader>
      ) : (
        controls
      )}
    </div>
  );
}
