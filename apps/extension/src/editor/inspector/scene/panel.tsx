import { EditorInspectorFrameBackgroundFillEditor } from './background';
import { EditorInspectorFrameBackgroundSection } from './placement/background';
import { EditorInspectorFramePlacementSection } from './placement';
import { FramePaddingFields } from './padding';
import { FrameApplyButton } from './apply-button';
import type { EditorInspectorFramePanelProps } from './types';
import { EditorInspectorBackgroundBlurControl } from './background/blur';
import { EditorInspectorFrameSourceImageSection } from './source-image';

function createFramePanelControls(props: EditorInspectorFramePanelProps) {
  return [
    <EditorInspectorFrameBackgroundSection
      key="background-mode"
      frameBackgroundModeOptions={props.frameBackgroundModeOptions}
      frameDraft={props.frameDraft}
      setBackgroundMode={props.setBackgroundMode}
    >
      <EditorInspectorFrameBackgroundFillEditor
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
      />
      <EditorInspectorBackgroundBlurControl
        frameDraft={props.frameDraft}
        applyFramePatch={props.applyFramePatch}
      />
    </EditorInspectorFrameBackgroundSection>,
    <EditorInspectorFramePlacementSection
      key="placement"
      frameDraft={props.frameDraft}
      frameLayoutModeOptions={props.frameLayoutModeOptions}
      setLayoutMode={props.setLayoutMode}
    >
      <FramePaddingFields frameDraft={props.frameDraft} setFrameDraft={props.setFrameDraft} />
    </EditorInspectorFramePlacementSection>,
    <EditorInspectorFrameSourceImageSection
      key="source-image"
      applyFramePatch={props.applyFramePatch}
      frameDraft={props.frameDraft}
      {...(props.lineStyleOptions === undefined
        ? {}
        : { lineStyleOptions: props.lineStyleOptions })}
      recentColors={props.recentColors}
      {...(props.shapeStrokePalette === undefined
        ? {}
        : { shapeStrokePalette: props.shapeStrokePalette })}
    />,
    <FrameApplyButton
      key="apply"
      onApplyFrame={props.onApplyFrame}
      {...(props.onCancelFrame === undefined ? {} : { onCancelFrame: props.onCancelFrame })}
    />,
  ];
}

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  return <div className="space-y-3">{createFramePanelControls(props)}</div>;
}
