import { useRef } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import type { BlurType } from '../../../features/highlighter/contracts';
import { FrameSettingsPopoverContent } from './views';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover/surface';
import { usePopoverDistanceClose, usePopoverEscapeClose } from '../popover/hooks';
import type { SettingsPopoverContext } from '../popover/header';
import { useFrameAnnotationPopoverPresentation } from '../popover/presentation';
import { getBorderPresetCssValidation } from '../../../ui/highlighter-preset-editor/useBorderPresetEditorState/validation';
import { BorderPresetEditor } from '../../../ui/highlighter-preset-editor';
import { useFrameCreationPopoverState } from './popover-state';
import type { FrameAnnotationStyleSettings } from '../contracts';

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

  usePopoverDistanceClose({
    isOpen: props.isOpen && !state.presetEditor.isOpen,
    onClose: props.onClose,
    popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: props.anchorEl,
    isOpen: props.isOpen && !state.presetEditor.isOpen,
    onClose: props.onClose,
  });

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
          handleEditPreset={(preset) => {
            state.presetEditor.setEditingPreset(preset);
            state.presetEditor.setOpen(true);
          }}
          handleFocusChange={(opacity) =>
            state.border.apply({ focusSettings: { ...props.settings.focusSettings, opacity } })
          }
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
          onEffectModeChange={(effectMode) => state.border.apply({ effectMode })}
          onShowPresets={state.catalog.refresh}
          pendingPresetIds={state.catalog.pendingPresetIds}
          {...(props.settings.borderSettings.sourcePresetId
            ? { selectedPresetId: props.settings.borderSettings.sourcePresetId }
            : {})}
        />
      </div>
      <BorderPresetEditor
        isOpen={state.presetEditor.isOpen}
        isSaving={state.presetSaving.isSaving}
        onClose={() => state.presetEditor.setOpen(false)}
        onSave={state.presetEditor.saveEdited}
        {...(state.presetEditor.editingPreset ? { preset: state.presetEditor.editingPreset } : {})}
      />
    </ContentPopoverAdapter>
  );
}
