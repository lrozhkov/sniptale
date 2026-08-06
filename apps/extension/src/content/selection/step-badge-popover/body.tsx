import { useEffect, useState } from 'react';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
  StepBadgePreset,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePresetSection } from './preset-list';
import { StepBadgeManualSettings } from './manual';
import type { FloatingPopoverDrag } from '../popover-sync/drag';
import {
  SettingsPopoverHeader,
  type SettingsPopoverContext,
} from '../popover-sync/settings-header';
import { selectOrClosePopoverPreset } from '../popover-sync/preset-selection';

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
  onConfigurePreset: (preset: StepBadgePreset) => void;
  onCreatePreset: (
    name: string,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
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
  frameVisuals: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
    fillOpacity?: number;
  };
}) {
  const [mode, setMode] = useState<'preset' | 'manual'>(() =>
    props.localStepBadgeSettings.sourcePresetId ? 'preset' : 'manual'
  );
  const hasSelectedPreset = Boolean(props.localStepBadgeSettings.sourcePresetId);
  useEffect(() => {
    setMode(hasSelectedPreset ? 'preset' : 'manual');
  }, [hasSelectedPreset]);
  const switchMode = () => {
    const nextMode = mode === 'preset' ? 'manual' : 'preset';
    if (nextMode === 'preset') void props.onShowPresets();
    setMode(nextMode);
  };

  return (
    <>
      <SettingsPopoverHeader
        action={{
          label: translate(
            mode === 'preset'
              ? 'content.stepBadge.switchToManual'
              : 'content.stepBadge.switchToPresets'
          ),
          onClick: switchMode,
        }}
        closeLabel={translate('content.stepBadge.closeSettings')}
        context={props.headerContext}
        destructiveAction={{
          label: translate('content.stepBadge.disableButton'),
          onClick: props.onDisable,
        }}
        {...(props.headerDrag ? { drag: props.headerDrag } : {})}
        onClose={props.onClose}
        title={translate('content.stepBadge.settingsTitle')}
      />
      {mode === 'preset' ? (
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
          onConfigure={props.onConfigurePreset}
          onReset={props.onResetPreset}
          onToggle={props.onTogglePreset}
          pending={props.pendingPresetIds}
          presets={props.presets}
        />
      ) : (
        <StepBadgeManualSettings {...props} settings={props.localStepBadgeSettings} />
      )}
    </>
  );
}
