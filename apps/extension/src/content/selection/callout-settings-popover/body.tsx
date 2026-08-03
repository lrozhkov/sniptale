import type {
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../platform/i18n';
import type { CalloutSettingsPatch } from '../callout/model';
import {
  CalloutAppearanceSection,
  CalloutConnectorSection,
  CalloutDeleteButton,
  CalloutPositionSection,
  CalloutPresetSection,
  CalloutTypographySection,
} from './views';

export function CalloutSettingsPopoverContent(props: {
  handleDelete: () => void;
  handleSettingChange: (patch: CalloutSettingsPatch) => void;
  localSettings: CalloutSettings;
  onApplyPreset: (preset: CalloutPreset) => void;
  onEditPreset: (preset: CalloutPreset) => void;
  onSavePreset: (name: string) => void;
  onTogglePreset: (preset: CalloutPreset) => void;
  presets: CalloutPreset[];
  presetError: string | null;
}) {
  return (
    <>
      <ProductToolbarMenuGroupLabel>
        {translate('content.callout.settingsTitle')}
      </ProductToolbarMenuGroupLabel>
      <CalloutPresetSection
        {...(props.localSettings.sourcePresetId
          ? { activePresetId: props.localSettings.sourcePresetId }
          : {})}
        onApplyPreset={props.onApplyPreset}
        onEditPreset={props.onEditPreset}
        onSavePreset={props.onSavePreset}
        onTogglePreset={props.onTogglePreset}
        presets={props.presets}
        error={props.presetError}
      />
      <CalloutPositionSection
        anchor={props.localSettings.placement.anchor}
        side={props.localSettings.placement.side}
        onAnchorChange={(anchor) => props.handleSettingChange({ placement: { anchor } })}
        onSideChange={(side) => props.handleSettingChange({ placement: { side } })}
      />
      <CalloutAppearanceSection
        settings={props.localSettings}
        onChange={props.handleSettingChange}
      />
      <CalloutConnectorSection
        settings={props.localSettings}
        onChange={props.handleSettingChange}
      />
      <CalloutTypographySection
        settings={props.localSettings}
        onChange={props.handleSettingChange}
      />
      <CalloutDeleteButton onDelete={props.handleDelete} />
    </>
  );
}
