import { useRef } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import type { BlurType } from '../../../features/highlighter/contracts';
import { FrameSettingsPopoverContent } from './views';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover/surface';
import { usePopoverEscapeClose } from '../popover/hooks';
import type { SettingsPopoverContext } from '../popover/header';
import { useFrameAnnotationPopoverPresentation } from '../popover/presentation';
import { getBorderPresetCssValidation } from '../../../ui/highlighter-preset-editor/useBorderPresetEditorState/validation';
import { useFrameCreationPopoverState } from './popover-state';
import type { FrameAnnotationStyleSettings } from '../contracts';
import { useLinkedAnnotationTemplateOptions } from './linked-template-options';
import { usePopoverInteractionDismissal } from '../popover/interaction-dismissal';

export type { FrameAnnotationStyleSettings } from '../contracts';

export function FrameAnnotationCreationFramePopover(props: {
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onChange: (settings: FrameAnnotationStyleSettings) => void;
  onClose: () => void;
  portalTarget?: HTMLElement | DocumentFragment | ShadowRoot;
  settings: FrameAnnotationStyleSettings;
  headerContext?: SettingsPopoverContext;
  resetKey?: string;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const state = useFrameCreationPopoverState(props);
  const dismissal = usePopoverInteractionDismissal({ blocked: false, isOpen: props.isOpen });
  const linkedTemplateOptions = useLinkedAnnotationTemplateOptions();
  const headerContext = props.headerContext ?? 'toolbar';
  const presentation = useFrameAnnotationPopoverPresentation({
    anchorEl: props.anchorEl,
    context: headerContext,
    height: SETTINGS_POPOVER_HEIGHT,
    isOpen: props.isOpen,
    popoverRef,
    resetKey: props.resetKey ?? 'future-frame',
    width: SETTINGS_POPOVER_WIDTH,
  });

  usePopoverEscapeClose({
    anchorEl: props.anchorEl,
    isOpen: dismissal.isDismissalEnabled,
    onClose: props.onClose,
  });
  const handleFocusBlurChange = (blurAmount: number) => {
    state.border.apply({ focusSettings: { ...props.settings.focusSettings, blurAmount } });
  };

  return (
    <ContentPopoverAdapter
      anchorEl={props.anchorEl}
      className={[
        'sniptale-frame-settings-popover sniptale-glass-popover',
        'sniptale-content-popover sniptale-content-popover--toolbar-menu',
        'sniptale-main-toolbar-popover',
      ].join(' ')}
      dataUi="frame-annotation.creation.frame-popover"
      isOpen={props.isOpen}
      popoverRef={popoverRef}
      portalTarget={props.portalTarget ?? document.body}
      style={{ ...presentation.style, width: SETTINGS_POPOVER_WIDTH }}
    >
      <div className="sniptale-content-popover-body">
        <FrameSettingsPopoverContent
          effectMode={props.settings.effectMode}
          globalSettings={state.catalog.settings}
          handleBlurChange={(amount) =>
            state.border.apply({ blurSettings: { ...props.settings.blurSettings, amount } })
          }
          handleBlurShowBorderChange={(showBorder) =>
            state.border.apply({ blurSettings: { ...props.settings.blurSettings, showBorder } })
          }
          handleBlurTypeChange={(blurType: BlurType) =>
            state.border.apply({ blurSettings: { ...props.settings.blurSettings, blurType } })
          }
          handleForkPreset={state.border.forkPreset}
          handleFocusChange={(opacity) =>
            state.border.apply({ focusSettings: { ...props.settings.focusSettings, opacity } })
          }
          handleFocusBlurChange={handleFocusBlurChange}
          handleFocusShowBorderChange={(showBorder) =>
            state.border.apply({ focusSettings: { ...props.settings.focusSettings, showBorder } })
          }
          handleManualBorderChange={state.border.applyPatch}
          handleSelectPreset={state.border.selectPreset}
          handleTogglePresetEnabled={state.catalog.togglePresetEnabled}
          headerContext={headerContext}
          {...(presentation.drag ? { headerDrag: presentation.drag } : {})}
          localBlurSettings={props.settings.blurSettings}
          localBorderSettings={props.settings.borderSettings}
          localFocusSettings={props.settings.focusSettings}
          linkedTemplateOptions={linkedTemplateOptions}
          manual={{
            cssDraft: state.css.draft,
            cssError: getBorderPresetCssValidation(state.css.draft).cssError,
            isSaving: state.presetSaving.isSaving,
            onCssDraftChange: (next) => {
              state.css.setDraft(next);
              const validation = getBorderPresetCssValidation(next);
              if (!validation.cssError && !validation.hasBlockedProps) {
                state.border.applyPatch({
                  customCss: next,
                  inheritCustomCss: Boolean(next.trim()),
                });
              }
            },
            save: state.presetSaving.save,
          }}
          onClose={props.onClose}
          onFloatingInteractionChange={dismissal.onFloatingInteractionChange}
          onEffectModeChange={(effectMode) => state.border.apply({ effectMode })}
          onShowPresets={state.catalog.refresh}
          pendingPresetIds={state.catalog.pendingPresetIds}
          {...(props.settings.borderSettings.sourcePresetId
            ? { selectedPresetId: props.settings.borderSettings.sourcePresetId }
            : {})}
        />
      </div>
    </ContentPopoverAdapter>
  );
}
