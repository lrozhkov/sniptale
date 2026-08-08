import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
  StepBadgePreset,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePresetSection } from './preset-list';
import { StepBadgeManualSettings } from './manual';
import type { FloatingPopoverDrag } from '../popover/drag';
import { SettingsPopoverHeader, type SettingsPopoverContext } from '../popover/header';
import { selectOrClosePopoverPreset } from '../popover/preset-selection';
import { createTemplateSourceAction, type TemplateSourceControl } from '../popover/template-source';
import { TemplateForkReturnGuard, useTemplateForkWorkflow } from '../popover/template-fork';

export function StepBadgePopoverContent(props: {
  frameId: string;
  headerContext: SettingsPopoverContext;
  headerDrag?: FloatingPopoverDrag;
  isAuto: boolean;
  localStepBadgeSettings: StepBadgeSettings;
  onClose: () => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onAutoModeChange: (auto: boolean) => void;
  onDisable: () => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onTypeChange: (type: 'number' | 'letter') => void;
  onValueChange: (value: string) => void;
  onSettingsChange: (patch: Partial<StepBadgeSettings>) => void;
  onApplyPreset: (preset: StepBadgePreset) => void;
  onForkPreset?: (preset: StepBadgePreset) => void;
  onCreatePreset: (
    name: string,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ id?: string; outcome: string }>;
  onTemplateCreated?: (templateId: string) => void;
  onUpdatePreset: (
    preset: StepBadgePreset,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  onResetPreset: (preset: StepBadgePreset) => void;
  onShowPresets: () => void | Promise<void>;
  onTogglePreset: (preset: StepBadgePreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: StepBadgePreset[];
  presetError: string | null;
  templateSettings: StepBadgeTemplateSettings;
  templateSourceControl?: TemplateSourceControl;
  frameVisuals: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
  };
  onReorder?: (direction: 'up' | 'down', frameId: string) => void;
}) {
  const workflow = useTemplateForkWorkflow({
    ...(props.localStepBadgeSettings.sourcePresetId
      ? { activeTemplateId: props.localStepBadgeSettings.sourcePresetId }
      : {}),
    onFork: props.onForkPreset ?? (() => props.onSettingsChange({})),
    onRestore: props.onApplyPreset,
    onShowTemplates: props.onShowPresets,
    templates: props.presets,
  });

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
        closeLabel={translate('content.stepBadge.closeSettings')}
        context={props.headerContext}
        destructiveAction={{
          label: translate('content.stepBadge.disableButton'),
          onClick: props.onDisable,
        }}
        {...(props.templateSourceControl
          ? {
              sourceAction: createTemplateSourceAction(props.templateSourceControl, {
                forcedDescription: translate('content.stepBadge.templateSourceForcedHint'),
                forcedLabel: translate('content.stepBadge.templateSourceForced'),
                frameDescription: translate('content.stepBadge.templateSourceFrameHint'),
                frameLabel: translate('content.stepBadge.templateSourceFrame'),
              }),
            }
          : {})}
        {...(props.headerDrag ? { drag: props.headerDrag } : {})}
        onClose={props.onClose}
        {...(workflow.mode === 'temporary'
          ? { status: translate('content.templateFork.temporaryStatus') }
          : {})}
        title={translate('content.stepBadge.settingsTitle')}
      />
      {workflow.confirmingReturn ? (
        <TemplateForkReturnGuard
          onContinue={workflow.continueEditing}
          onDiscard={workflow.discard}
          onGoToSave={workflow.goToSave}
        />
      ) : workflow.mode === 'templates' ? (
        <StepBadgePresetSection
          {...(props.localStepBadgeSettings.sourcePresetId
            ? { activePresetId: props.localStepBadgeSettings.sourcePresetId }
            : {})}
          error={props.presetError}
          onApply={(preset) => {
            selectOrClosePopoverPreset({
              isActive: props.localStepBadgeSettings.sourcePresetId === preset.id,
              onApply: props.onApplyPreset,
              onClose: props.onClose,
              preset,
            });
          }}
          onFork={workflow.fork}
          onReset={props.onResetPreset}
          onToggle={props.onTogglePreset}
          pending={props.pendingPresetIds}
          presets={props.presets}
        />
      ) : (
        <StepBadgeManualSettings
          {...props}
          onTemplateCreated={(templateId) => {
            props.onTemplateCreated?.(templateId);
            workflow.completeSave();
          }}
          {...(workflow.saveRequest > 0 ? { saveSectionRequest: workflow.saveRequest } : {})}
          settings={props.localStepBadgeSettings}
        />
      )}
    </>
  );
}
