import { translate } from '../../../../platform/i18n';
import { SettingsSectionHeader } from '../../../section-surface';

import type { AppearanceSectionState } from './types';

export function AppearanceSectionHeader({ locale }: { locale: AppearanceSectionState['locale'] }) {
  return (
    <SettingsSectionHeader
      description={translate('settings.appearance.description', locale)}
      kicker={translate('settings.navigation.appearance', locale)}
    />
  );
}
