import { translate } from '../../../../platform/i18n';
import { SettingsSectionHeader } from '../../../section-surface';

export function AIProvidersHeader() {
  return (
    <SettingsSectionHeader
      description={translate('settings.aiProviders.subtitle')}
      kicker={translate('settings.navigation.ai')}
    />
  );
}
