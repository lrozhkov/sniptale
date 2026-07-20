import { translate } from '../../../../platform/i18n';
import { SettingsSectionHeader } from '../../../section-surface';

export function PresetsHeader() {
  return (
    <SettingsSectionHeader
      description={translate('viewportPresets.section.subtitle')}
      kicker={translate('settings.navigation.presets')}
    />
  );
}
