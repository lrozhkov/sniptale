import type React from 'react';
import { Paintbrush, SlidersHorizontal } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../../platform/i18n';
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

function FrameFieldGroup(props: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

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
      <CategorizedInspector
        dataUi="editor.frame.categories"
        ariaLabel={translate('editor.scene.sceneBackgroundTitle')}
        initialSection="background"
        showSectionHeading
        sections={[
          {
            id: 'background',
            label: translate('editor.scene.backgroundPanelSection'),
            icon: Paintbrush,
          },
          {
            id: 'additional',
            label: translate('editor.scene.additionalSection'),
            icon: SlidersHorizontal,
          },
        ]}
        renderSection={(section) =>
          section === 'background' ? (
            <section data-section="background" className="space-y-5">
              <FrameFieldGroup title={translate('editor.scene.backgroundTypeSection')}>
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
              </FrameFieldGroup>
              <FrameFieldGroup title={translate('editor.scene.placementSection')}>
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
              </FrameFieldGroup>
              <FrameFieldGroup title={translate('editor.runtime.sourceImage')}>
                <EditorInspectorFrameSourceImageBasics {...sourceImageProps(props)} />
              </FrameFieldGroup>
            </section>
          ) : (
            <section data-section="additional">
              <EditorInspectorFrameSourceImageEffects {...sourceImageProps(props)} />
            </section>
          )
        }
      />
      <div data-ui="editor.frame.actions" className="px-3 pb-3 pt-2">
        <FrameApplyButton
          onApplyFrame={props.onApplyFrame}
          {...(props.onCancelFrame === undefined ? {} : { onCancelFrame: props.onCancelFrame })}
        />
      </div>
    </div>
  );
}
