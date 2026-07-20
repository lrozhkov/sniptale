import { translate } from '../../../platform/i18n';
import { SettingsSectionHeader } from '../../section-surface';

export function ImageSettingsSectionHeader() {
  return (
    <SettingsSectionHeader
      description={translate('imageSettings.section.subtitle')}
      kicker={translate('settings.navigation.image')}
    />
  );
}
