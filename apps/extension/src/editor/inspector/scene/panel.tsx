import { disableFrameBackground, isFrameBackgroundNone } from './background/settings';
import { EditorInspectorFrameBackgroundFillEditor } from './background';
import { EditorInspectorFrameBackgroundModeControl } from './placement/background';
import { EditorInspectorFramePlacementSection } from './placement';
import { FramePaddingSection } from './padding';
import { FrameApplyButton } from './apply-button';
import type { EditorInspectorFramePanelProps } from './types';
import { EditorInspectorBackgroundBlurControl } from './background/blur';
import {
  EditorInspectorFrameSourceImageBasics,
  EditorInspectorFrameSourceImageEffects,
} from './source-image';
import './panel.css';

function sourceImageProps(props: EditorInspectorFramePanelProps) {
  return {
    applyFramePatch: props.applyFramePatch,
    frameDraft: props.frameDraft,
    recentColors: props.recentColors,
    ...(props.lineStyleOptions === undefined ? {} : { lineStyleOptions: props.lineStyleOptions }),
    ...(props.shapeStrokePalette === undefined
      ? {}
      : { shapeStrokePalette: props.shapeStrokePalette }),
  };
}

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  return (
    <div data-ui="editor.frame-panel" className="min-w-0">
      <div className="sniptale-parameter-stack px-2 pt-2">
        <div className="sniptale-parameter-stack">
          <EditorInspectorFrameBackgroundModeControl
            frameDraft={props.frameDraft}
            lastFillModeRef={props.lastFillModeRef}
            setBackgroundMode={props.setBackgroundMode}
          />
          {!isFrameBackgroundNone(props.frameDraft) && (
            <>
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
              {props.frameDraft.backgroundMode !== 'color' ||
              props.frameDraft.backgroundBlurAmount > 0 ? (
                <EditorInspectorBackgroundBlurControl
                  frameDraft={props.frameDraft}
                  applyFramePatch={props.applyFramePatch}
                />
              ) : null}
            </>
          )}
        </div>
        {!isFrameBackgroundNone(props.frameDraft) && (
          <>
            <div className="sniptale-parameter-stack">
              <EditorInspectorFramePlacementSection
                hideHeader
                frameDraft={props.frameDraft}
                frameLayoutModeOptions={props.frameLayoutModeOptions}
                setLayoutMode={props.setLayoutMode}
              />
              <FramePaddingSection
                frameDraft={props.frameDraft}
                framePaddingSummary={props.framePaddingSummary}
                hideHeader
                setFrameDraft={props.setFrameDraft}
              />
            </div>
            <div className="sniptale-parameter-stack">
              <EditorInspectorFrameSourceImageBasics {...sourceImageProps(props)} />
              <EditorInspectorFrameSourceImageEffects {...sourceImageProps(props)} />
            </div>
          </>
        )}
      </div>
      <div data-ui="editor.frame.actions" className="px-2 pb-2 pt-2">
        <FrameApplyButton onApplyFrame={() => props.setFrameDraft(disableFrameBackground)} />
      </div>
    </div>
  );
}
