import { CopyPlus, Eye, EyeOff } from 'lucide-react';

import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetPreview,
} from '@sniptale/ui/product-glass-controls';
import { translate, useAppLocale } from '../../../platform/i18n';
import type {
  BlurSettings,
  BlurType,
  BorderPreset,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import { getBorderPresetPreviewStyle } from './helpers';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { BorderStyleInspector } from '../../../ui/highlighter-preset-editor/fields/inspector';
import type { LinkedAnnotationTemplateOptions } from '../../../ui/highlighter-preset-editor/fields/inspector';
import { BorderManualSaveSettings } from '../../../ui/highlighter-preset-editor/fields/save-settings';
import { HighlighterManualInspectorSurface } from '../../../ui/highlighter-preset-editor/manual-inspector-surface';
import type {
  AppliedBorderSettings,
  BorderVisualStylePatch,
} from '../../../features/highlighter/contracts';
import type { FloatingPopoverDrag } from '../popover/drag';
import { SettingsPopoverHeader, type SettingsPopoverContext } from '../popover/header';
import { selectOrClosePopoverPreset } from '../popover/preset-selection';
import { useOpeningPresetOrder } from '../popover/preset-order';
import { TemplateForkReturnGuard, useTemplateForkWorkflow } from '../popover/template-fork';
import { ApplyToFutureFramesGuard, useApplyToFutureFrames } from '../popover/apply-future';
import {
  FrameBlurControls,
  FrameDecorationToggle,
  FrameEffectModeSelector,
  FrameFocusControls,
} from './effect-controls';

function getFrameEffectTitle(effectMode: EffectMode) {
  if (effectMode === 'border') return translate('content.interactiveFrame.effectBorder');
  if (effectMode === 'blur') return translate('content.interactiveFrame.effectBlur');
  return translate('content.interactiveFrame.effectFocus');
}

interface FrameSettingsPopoverContentProps {
  acceptAction?: (event: Event) => boolean;
  compact?: boolean;
  effectMode: EffectMode;
  globalSettings: HighlighterSettings;
  handleBlurChange: (amount: number) => void;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  handleFocusBlurChange: (blurAmount: number) => void;
  handleFocusChange: (opacity: number) => void;
  handleFocusShowBorderChange: (showBorder: boolean) => void;
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  handleForkPreset?: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  localBlurSettings: BlurSettings;
  localBorderSettings: AppliedBorderSettings;
  localFocusSettings: FocusSettings;
  linkedTemplateOptions?: LinkedAnnotationTemplateOptions;
  headerContext: SettingsPopoverContext;
  headerDrag?: FloatingPopoverDrag;
  onClose: () => void;
  onApplyToFuture?: () => void;
  onEffectModeChange?: (mode: EffectMode) => void;
  onShowPresets: () => void | Promise<void>;
  onFloatingInteractionChange?: (open: boolean) => void;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
}

export function FrameSettingsPopoverContent(props: FrameSettingsPopoverContentProps) {
  const workflow = useTemplateForkWorkflow({
    ...(props.selectedPresetId ? { activeTemplateId: props.selectedPresetId } : {}),
    onFork: props.handleForkPreset ?? props.handleSelectPreset,
    onRestore: props.handleSelectPreset,
    onShowTemplates: props.onShowPresets,
    templates: props.globalSettings.borderPresets,
  });
  const applyToFuture = useApplyToFutureFrames(props.onApplyToFuture);

  return (
    <>
      <SettingsPopoverHeader
        {...(workflow.mode === 'temporary'
          ? {
              action: {
                label: translate('content.templateFork.backToTemplates'),
                onClick: workflow.requestTemplates,
              },
            }
          : {})}
        {...(workflow.mode === 'temporary' &&
        props.headerContext === 'element' &&
        props.onApplyToFuture
          ? {
              applyToFutureAction: {
                label: translate('content.templateFork.applyToFuture'),
                onClick: applyToFuture.request,
              },
            }
          : {})}
        closeLabel={translate('content.interactiveFrame.closeEffectSettings')}
        context={props.headerContext}
        {...(props.headerDrag ? { drag: props.headerDrag } : {})}
        onClose={props.onClose}
        title={getFrameEffectTitle(props.effectMode)}
      />
      {applyToFuture.confirming ? (
        <ApplyToFutureFramesGuard
          onCancel={applyToFuture.cancel}
          onConfirm={applyToFuture.confirm}
        />
      ) : workflow.confirmingReturn ? (
        <TemplateForkReturnGuard
          onContinue={workflow.continueEditing}
          onDiscard={workflow.discard}
          onGoToSave={workflow.goToSave}
        />
      ) : (
        <>
          <FrameEffectModeSelector
            effectMode={props.effectMode}
            onChange={(effectMode) => {
              if (effectMode === props.effectMode) {
                props.onClose();
                return;
              }
              props.onEffectModeChange?.(effectMode);
            }}
          />
          {props.effectMode === 'blur' ? (
            <>
              <FrameBlurControls
                handleBlurChange={props.handleBlurChange}
                handleBlurTypeChange={props.handleBlurTypeChange}
                settings={props.localBlurSettings}
              />
              <FrameDecorationToggle
                onChange={props.handleBlurShowBorderChange}
                showBorder={props.localBlurSettings.showBorder ?? false}
              />
            </>
          ) : null}

          {props.effectMode === 'focus' ? (
            <>
              <FrameFocusControls
                handleFocusBlurChange={props.handleFocusBlurChange}
                handleFocusChange={props.handleFocusChange}
                settings={props.localFocusSettings}
              />
              <FrameDecorationToggle
                onChange={props.handleFocusShowBorderChange}
                showBorder={props.localFocusSettings.showBorder ?? false}
              />
            </>
          ) : null}

          <FrameBorderSection
            borderPresets={props.globalSettings.borderPresets}
            {...(props.acceptAction ? { acceptAction: props.acceptAction } : {})}
            handleManualBorderChange={props.handleManualBorderChange}
            handleSelectPreset={props.handleSelectPreset}
            handleTogglePresetEnabled={props.handleTogglePresetEnabled}
            pendingPresetIds={props.pendingPresetIds}
            localBorderSettings={props.localBorderSettings}
            linkedTemplateOptions={props.linkedTemplateOptions ?? { callouts: [], stepBadges: [] }}
            manual={props.manual}
            {...(workflow.mode === 'temporary'
              ? { manualStatus: translate('content.templateFork.temporaryStatus') }
              : {})}
            mode={workflow.mode === 'templates' ? 'preset' : 'manual'}
            onForkPreset={workflow.fork}
            onCreated={workflow.completeSave}
            {...(workflow.saveRequest > 0 ? { saveSectionRequest: workflow.saveRequest } : {})}
            onClose={props.onClose}
            {...(props.onFloatingInteractionChange
              ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
              : {})}
            {...(props.selectedPresetId === undefined
              ? {}
              : { selectedPresetId: props.selectedPresetId })}
          />
        </>
      )}
    </>
  );
}

function FrameBorderSection(props: {
  acceptAction?: (event: Event) => boolean;
  borderPresets: BorderPreset[];
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
  localBorderSettings: AppliedBorderSettings;
  linkedTemplateOptions: LinkedAnnotationTemplateOptions;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
  manualStatus?: string;
  onCreated: () => void;
  onForkPreset: (preset: BorderPreset) => void;
  saveSectionRequest?: number;
  mode: 'preset' | 'manual';
  onClose: () => void;
  onFloatingInteractionChange?: (open: boolean) => void;
}) {
  const locale = useAppLocale();
  const enabledPresetCount = props.borderPresets.filter(
    (preset) => preset.enabled !== false
  ).length;

  return (
    <ContentPopoverSection className="sniptale-frame-style-section">
      {props.mode === 'preset' ? (
        <FramePresetMode
          {...(props.acceptAction ? { acceptAction: props.acceptAction } : {})}
          borderPresets={props.borderPresets}
          enabledPresetCount={enabledPresetCount}
          onForkPreset={props.onForkPreset}
          handleSelectPreset={props.handleSelectPreset}
          handleTogglePresetEnabled={props.handleTogglePresetEnabled}
          locale={locale}
          onClose={props.onClose}
          pendingPresetIds={props.pendingPresetIds}
          {...(props.selectedPresetId === undefined
            ? {}
            : { selectedPresetId: props.selectedPresetId })}
        />
      ) : null}
      {props.mode === 'manual' ? <FrameManualMode {...props} /> : null}
    </ContentPopoverSection>
  );
}

function FramePresetMode(props: {
  acceptAction?: (event: Event) => boolean;
  borderPresets: BorderPreset[];
  enabledPresetCount: number;
  onForkPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  locale: ReturnType<typeof useAppLocale>;
  onClose: () => void;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
}) {
  const orderedPresets = useOpeningPresetOrder(props.borderPresets, props.selectedPresetId);
  return (
    <>
      <ProductGlassPresetList scrollable variant="menu">
        {orderedPresets.map((preset) => (
          <FramePresetRow
            {...(props.acceptAction ? { acceptAction: props.acceptAction } : {})}
            enabledPresetCount={props.enabledPresetCount}
            onForkPreset={props.onForkPreset}
            handleSelectPreset={props.handleSelectPreset}
            handleTogglePresetEnabled={props.handleTogglePresetEnabled}
            key={preset.id}
            locale={props.locale}
            onClose={props.onClose}
            pending={props.pendingPresetIds.has(preset.id)}
            preset={preset}
            selected={props.selectedPresetId === preset.id}
          />
        ))}
      </ProductGlassPresetList>
    </>
  );
}

function FramePresetRow(props: {
  acceptAction?: (event: Event) => boolean;
  enabledPresetCount: number;
  onForkPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  locale: ReturnType<typeof useAppLocale>;
  onClose: () => void;
  pending: boolean;
  preset: BorderPreset;
  selected: boolean;
}) {
  const displayName = getBorderPresetDisplayName(props.preset, props.locale);
  const isEnabled = props.preset.enabled !== false;
  const isLastEnabled = isEnabled && props.enabledPresetCount <= 1;
  const visibilityActionLabel = translate(
    isLastEnabled
      ? 'highlighter.section.lastEnabledPresetDisabled'
      : isEnabled
        ? 'content.overlayControls.hideFrameStyle'
        : 'content.overlayControls.restoreFrameStyle'
  );

  return (
    <div className="sniptale-frame-style-preset-row" data-enabled={String(isEnabled)}>
      <ProductGlassPresetItem
        active={props.selected}
        disabled={!isEnabled}
        showActiveIndicator
        onClick={(event) => {
          if (acceptFrameSettingsAction(event.nativeEvent, props.acceptAction)) {
            selectOrClosePopoverPreset({
              isActive: props.selected,
              onApply: props.handleSelectPreset,
              onClose: props.onClose,
              preset: props.preset,
            });
          }
        }}
      >
        <ProductGlassPresetPreview style={getBorderPresetPreviewStyle(props.preset)} />
        <ProductGlassPresetMeta>
          <PresetNameWithOverflowHint name={displayName} />
        </ProductGlassPresetMeta>
      </ProductGlassPresetItem>
      <span className="sniptale-frame-style-preset-actions">
        <button
          aria-label={translate('content.templateFork.fork')}
          className="sniptale-frame-style-preset-action"
          data-frame-style-action="fork"
          data-template-fork-source={props.preset.id}
          disabled={props.pending}
          onClick={(event) => {
            if (acceptFrameSettingsAction(event.nativeEvent, props.acceptAction)) {
              props.onForkPreset(props.preset);
            }
          }}
          title={translate('content.templateFork.fork')}
          type="button"
        >
          <CopyPlus size={15} />
        </button>
        <button
          aria-label={visibilityActionLabel}
          className="sniptale-frame-style-preset-action"
          data-frame-style-action="toggle-visibility"
          disabled={props.pending || isLastEnabled}
          onClick={(event) => {
            if (acceptFrameSettingsAction(event.nativeEvent, props.acceptAction)) {
              props.handleTogglePresetEnabled(props.preset);
            }
          }}
          title={visibilityActionLabel}
          type="button"
        >
          {isEnabled ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </div>
  );
}

function acceptFrameSettingsAction(
  event: Event,
  acceptAction: ((event: Event) => boolean) | undefined
): boolean {
  return acceptAction ? acceptAction(event) : event.isTrusted;
}

function FrameManualMode(props: {
  borderPresets: BorderPreset[];
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  localBorderSettings: AppliedBorderSettings;
  linkedTemplateOptions: LinkedAnnotationTemplateOptions;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
  manualStatus?: string;
  onCreated: () => void;
  saveSectionRequest?: number;
  onFloatingInteractionChange?: (open: boolean) => void;
}) {
  return (
    <HighlighterManualInspectorSurface>
      <BorderStyleInspector
        cssDraft={props.manual.cssDraft}
        cssError={props.manual.cssError}
        onChange={props.handleManualBorderChange}
        onCssDraftChange={props.manual.onCssDraftChange}
        {...(props.onFloatingInteractionChange
          ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
          : {})}
        {...(props.saveSectionRequest === undefined
          ? {}
          : { saveSectionRequest: props.saveSectionRequest })}
        saveSection={
          <BorderManualSaveSettings
            disabled={Boolean(props.manual.cssError)}
            isSaving={props.manual.isSaving}
            onSave={props.manual.save}
            onCreated={props.onCreated}
            onOverwritten={props.onCreated}
            {...(props.onFloatingInteractionChange
              ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
              : {})}
            presets={props.borderPresets}
          />
        }
        {...(props.manualStatus ? { saveSectionStatus: props.manualStatus } : {})}
        style={props.localBorderSettings}
        linkedTemplateOptions={props.linkedTemplateOptions}
      />
    </HighlighterManualInspectorSurface>
  );
}
