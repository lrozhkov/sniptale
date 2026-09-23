import { Image as ImageIcon } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { EditorInspectorDetails } from '../grouped';
import { EditorInspectorFrameBackgroundFillEditor } from './background';
import { EditorInspectorFrameBackgroundModeControl } from './placement/background';
import { EditorInspectorFramePlacementSection } from './placement';
import { FramePaddingSection } from './padding';
import { FrameApplyButton } from './apply-button';
import type { EditorInspectorFramePanelProps } from './types';
import { EditorInspectorBackgroundBlurControl } from './background/blur';
import { EditorInspectorFrameSourceImageFields } from './source-image';

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  return (
    <div data-ui="editor.frame-panel" className="flex h-full min-h-0 flex-col">
      <div
        data-ui="editor.inspector.sections"
        className={[
          'min-h-0 flex-1 divide-y divide-[var(--sniptale-color-border-soft)]',
          'overflow-y-auto [scrollbar-gutter:stable]',
        ].join(' ')}
      >
        <section
          data-section="background"
          aria-label={translate('editor.scene.backgroundTypeSection')}
          className="py-2 first:pt-0 last:pb-0 focus:outline-none"
          tabIndex={-1}
        >
          <div className="space-y-2">
            <EditorInspectorFrameBackgroundModeControl
              frameDraft={props.frameDraft}
              lastFillModeRef={props.lastFillModeRef}
              setBackgroundMode={props.setBackgroundMode}
            />
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
          </div>
        </section>
        <section
          data-section="placement"
          aria-label={translate('editor.scene.placementSection')}
          className="py-2 first:pt-0 last:pb-0 focus:outline-none"
          tabIndex={-1}
        >
          <div className="space-y-2">
            <FramePaddingSection
              frameDraft={props.frameDraft}
              framePaddingSummary={props.framePaddingSummary}
              hideHeader
              setFrameDraft={props.setFrameDraft}
            />
            <EditorInspectorFramePlacementSection
              hideHeader
              frameDraft={props.frameDraft}
              frameLayoutModeOptions={props.frameLayoutModeOptions}
              setLayoutMode={props.setLayoutMode}
            />
          </div>
        </section>
        <section
          data-section="source-image"
          aria-label={translate('editor.runtime.sourceImage')}
          className="py-2 first:pt-0 last:pb-0 focus:outline-none"
          tabIndex={-1}
        >
          <EditorInspectorDetails
            preferenceId="frame:source-image"
            level="section"
            icon={ImageIcon}
            label={translate('editor.runtime.sourceImage')}
          >
            <EditorInspectorFrameSourceImageFields
              applyFramePatch={props.applyFramePatch}
              frameDraft={props.frameDraft}
              {...(props.lineStyleOptions === undefined
                ? {}
                : { lineStyleOptions: props.lineStyleOptions })}
              recentColors={props.recentColors}
              {...(props.shapeStrokePalette === undefined
                ? {}
                : { shapeStrokePalette: props.shapeStrokePalette })}
            />
          </EditorInspectorDetails>
        </section>
      </div>
      <div data-ui="editor.frame.actions" className="shrink-0 pt-2">
        <FrameApplyButton
          onApplyFrame={props.onApplyFrame}
          {...(props.onCancelFrame === undefined ? {} : { onCancelFrame: props.onCancelFrame })}
        />
      </div>
    </div>
  );
}
