import { ProductGlassDestructiveButton } from '@sniptale/ui/product-glass-controls';
import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useState } from 'react';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
  StepBadgePreset,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgeAutoSection, StepBadgePositionSection, StepBadgeValueSection } from './views';
import { StepBadgePresetSection } from './preset-list';
import { StepBadgeAppearanceSection } from '../../../ui/highlighter-preset-editor/step-badge/inspector';
import { StepBadgeSaveSection } from './save-section';

function StepBadgeDisableButton(props: { onDisable: () => void }) {
  return (
    <ProductGlassDestructiveButton onClick={props.onDisable}>
      {translate('content.stepBadge.disableButton')}
    </ProductGlassDestructiveButton>
  );
}

export function StepBadgePopoverContent(props: {
  frameId: string;
  isAuto: boolean;
  localStepBadgeSettings: StepBadgeSettings;
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
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');
  const selectedAnchor = props.localStepBadgeSettings.anchor ?? 'top-left';
  const selectedOffsets = props.localStepBadgeSettings.offsetDirections ?? [];

  return (
    <>
      <ProductToolbarMenuGroupLabel>
        {translate('content.stepBadge.settingsTitle')}
      </ProductToolbarMenuGroupLabel>
      <ContentPopoverSection>
        <SegmentedSwitch
          activeId={mode}
          ariaLabel={translate('content.stepBadge.settingsTitle')}
          onChange={setMode}
          options={[
            { id: 'preset', label: translate('content.stepBadge.modePreset') },
            { id: 'manual', label: translate('content.stepBadge.modeManual') },
          ]}
        />
      </ContentPopoverSection>
      {mode === 'preset' ? (
        <StepBadgePresetSection
          {...(props.localStepBadgeSettings.sourcePresetId
            ? { activePresetId: props.localStepBadgeSettings.sourcePresetId }
            : {})}
          error={props.presetError}
          onApply={props.onApplyPreset}
          onConfigure={(preset) => {
            props.onApplyPreset(preset);
            setMode('manual');
            props.onConfigurePreset(preset);
          }}
          onReset={props.onResetPreset}
          onToggle={props.onTogglePreset}
          pending={props.pendingPresetIds}
          presets={props.presets}
        />
      ) : (
        <>
          <StepBadgePositionSection
            onAnchorChange={props.onAnchorChange}
            onOffsetToggle={props.onOffsetToggle}
            selectedAnchor={selectedAnchor}
            selectedOffsets={selectedOffsets}
          />

          <StepBadgeAutoSection
            isAuto={props.isAuto}
            settings={props.localStepBadgeSettings}
            onAlphabetChange={props.onAlphabetChange}
            onAutoModeChange={props.onAutoModeChange}
            onTypeChange={props.onTypeChange}
          />

          <StepBadgeValueSection
            frameId={props.frameId}
            isAuto={props.isAuto}
            onValueChange={props.onValueChange}
            value={props.localStepBadgeSettings.value}
          />
          <StepBadgeAppearanceSection
            frame={props.frameVisuals}
            onChange={props.onSettingsChange}
            settings={props.localStepBadgeSettings}
          />
          <StepBadgeSaveSection
            onCreate={props.onCreatePreset}
            onUpdate={props.onUpdatePreset}
            presets={props.presets}
            settings={props.templateSettings}
          />
        </>
      )}

      <StepBadgeDisableButton onDisable={props.onDisable} />
    </>
  );
}
