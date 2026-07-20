export { QuickActionsDisplayModeCard, QuickActionsEditor } from './editor';
export { QuickActionsList } from './list';

import { translate } from '../../../platform/i18n';
import { SettingsInlineConfirmation } from './inline-confirmation';
import { SettingsSectionHeader } from '../../section-surface';

export function QuickActionsHeader({
  confirmationMessage,
}: {
  confirmationMessage: string | null;
}) {
  return (
    <SettingsSectionHeader
      description={translate('settings.quickActions.subtitle')}
      kicker={translate('settings.navigation.quickactions')}
      aside={<SettingsInlineConfirmation message={confirmationMessage} />}
    />
  );
}
