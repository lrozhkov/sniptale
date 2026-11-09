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
        <div className="sniptale-parameter-stack pt-2">
          <EditorInspectorDetails
            preferenceId="frame:background"
            label={translate('editor.scene.backgroundSection')}
            level="section"
            initiallyOpen
          >
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
                {props.frameDraft.backgroundMode === 'image' && (
                  <EditorInspectorFrameBackgroundImageMode
                    frameDraft={props.frameDraft}
                    applyFramePatch={props.applyFramePatch}
                    frameBackgroundImageFitOptions={props.frameBackgroundImageFitOptions}
                  />
                )}
                {props.frameDraft.backgroundMode !== 'color' && (
                  <EditorInspectorBackgroundBlurControl
                    frameDraft={props.frameDraft}
                    applyFramePatch={props.applyFramePatch}
                    previewFramePatch={props.previewFramePatch}
                  />
                )}
              </>
            )}
          </EditorInspectorDetails>
          {!isFrameBackgroundNone(props.frameDraft) && (
            <>
              <EditorInspectorDetails
                preferenceId="frame:composition"
                label={translate('editor.scene.placementSection')}
                level="section"
                initiallyOpen
              >
                <FramePaddingSection
                  frameDraft={props.frameDraft}
                  framePaddingSummary={props.framePaddingSummary}
                  hideHeader
                  setFrameDraft={props.setFrameDraft}
                  previewFrameDraft={props.previewFrameDraft}
                />
                <EditorInspectorFramePlacementSection
                  hideHeader
                  frameDraft={props.frameDraft}
                  frameLayoutModeOptions={props.frameLayoutModeOptions}
                  setLayoutMode={props.setLayoutMode}
                />
              </EditorInspectorDetails>
              <EditorInspectorDetails
                preferenceId="frame:image"
                label={translate('editor.compact.image')}
                level="section"
                initiallyOpen
              >
                <EditorInspectorFrameSourceImageBasics {...sourceImageProps(props)} />
                <EditorInspectorFrameSourceImageEffects {...sourceImageProps(props)} />
              </EditorInspectorDetails>
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
