import { Image as ImageIcon, Move, Paintbrush } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../../platform/i18n';
import { EditorInspectorFrameBackgroundFillEditor } from './background';
import { EditorInspectorFrameBackgroundModeControl } from './placement/background';
import { EditorInspectorFramePlacementSection } from './placement';
import { FramePaddingSection } from './padding';
import { FrameApplyButton } from './apply-button';
import type { EditorInspectorFramePanelProps } from './types';
import { EditorInspectorBackgroundBlurControl } from './background/blur';
import { EditorInspectorFrameSourceImageFields } from './source-image';
import './panel.css';

export function EditorInspectorFramePanel(props: EditorInspectorFramePanelProps) {
  return (
    <div data-ui="editor.frame-panel" className="flex h-full min-h-0 flex-col">
      <div
        data-ui="editor.inspector.sections"
        className={[
          'min-h-0 flex-1 border-t border-[var(--sniptale-color-border-soft)]',
          'overflow-y-auto [scrollbar-gutter:stable] [&_nav]:sticky [&_nav]:top-0 [&_nav]:self-start',
        ].join(' ')}
      >
        <CategorizedInspector
          dataUi="editor.frame.categories"
          ariaLabel={translate('editor.scene.sceneBackgroundTitle')}
          initialSection="background"
          showSectionHeading
          sections={[
            {
              id: 'background',
              label: translate('editor.scene.backgroundTypeSection'),
              icon: Paintbrush,
            },
            { id: 'placement', label: translate('editor.scene.placementSection'), icon: Move },
            { id: 'source-image', label: translate('editor.runtime.sourceImage'), icon: ImageIcon },
          ]}
          renderSection={(section) => (
            <>
              {section === 'background' ? (
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
              ) : null}
              {section === 'placement' ? (
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
              ) : null}
              {section === 'source-image' ? (
                <section
                  data-section="source-image"
                  aria-label={translate('editor.runtime.sourceImage')}
                  className="py-2 first:pt-0 last:pb-0 focus:outline-none"
                  tabIndex={-1}
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
                </section>
              ) : null}
            </>
          )}
        />
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
