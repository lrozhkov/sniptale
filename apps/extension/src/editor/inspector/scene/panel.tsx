import { translate } from '../../../platform/i18n';
import { EditorInspectorDetails } from '../grouped';
import { EditorInspectorFrameBackgroundImageMode } from './background/image-mode';
import { useDefaultFrameBackgroundImage } from './background/default-image';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import {
  resetFrameBackground,
  isFrameBackgroundNone,
  isFrameBackgroundDefault,
} from './background/settings';
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
    previewFramePatch: props.previewFramePatch,
    frameDraft: props.frameDraft,
    recentColors: props.recentColors,
    ...(props.lineStyleOptions === undefined ? {} : { lineStyleOptions: props.lineStyleOptions }),
    ...(props.shapeStrokePalette === undefined
      ? {}
      : { shapeStrokePalette: props.shapeStrokePalette }),
  };
}

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  const backgroundSelection = useDefaultFrameBackgroundImage(props);
  return (
    <InspectorLayout>
      <div data-ui="editor.frame-panel" className="min-w-0">
        <div className="sniptale-parameter-stack px-2 pt-2">
          <div className="sniptale-parameter-stack">
            <EditorInspectorFrameBackgroundModeControl
              frameDraft={props.frameDraft}
              lastFillModeRef={props.lastFillModeRef}
              setBackgroundMode={backgroundSelection.select}
              imageDisabled={backgroundSelection.pending}
            />
            {backgroundSelection.failed && (
              <p role="alert">{translate('settings.editor.backgrounds.failed')}</p>
            )}
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
                    previewFramePatch={props.previewFramePatch}
                  />
                ) : null}
              </>
            )}
          </div>
          {!isFrameBackgroundNone(props.frameDraft) && (
            <>
              <div className="sniptale-parameter-stack">
                <FramePaddingSection
                  frameDraft={props.frameDraft}
                  framePaddingSummary={props.framePaddingSummary}
                  hideHeader
                  setFrameDraft={props.setFrameDraft}
                  previewFrameDraft={props.previewFrameDraft}
                />
              </div>
              <div className="sniptale-parameter-stack">
                <EditorInspectorFrameSourceImageBasics {...sourceImageProps(props)} />
                <EditorInspectorFrameSourceImageEffects {...sourceImageProps(props)} />
                <EditorInspectorDetails
                  preferenceId="frame:advanced"
                  label={translate('editor.scene.backgroundAdvanced')}
                >
                  {props.frameDraft.backgroundMode === 'image' &&
                    props.frameDraft.backgroundImageData && (
                      <EditorInspectorFrameBackgroundImageMode
                        frameDraft={props.frameDraft}
                        applyFramePatch={props.applyFramePatch}
                        frameBackgroundImageFitOptions={props.frameBackgroundImageFitOptions}
                      />
                    )}
                  <EditorInspectorFramePlacementSection
                    hideHeader
                    frameDraft={props.frameDraft}
                    frameLayoutModeOptions={props.frameLayoutModeOptions}
                    setLayoutMode={props.setLayoutMode}
                  />
                </EditorInspectorDetails>
              </div>
            </>
          )}
        </div>
        {!isFrameBackgroundNone(props.frameDraft) && (
          <div data-ui="editor.frame.actions" className="px-2 pb-2 pt-2">
            <FrameApplyButton
              disabled={isFrameBackgroundDefault(props.frameDraft)}
              onApplyFrame={() => props.setFrameDraft(resetFrameBackground)}
            />
          </div>
        )}
      </div>
    </InspectorLayout>
  );
}
