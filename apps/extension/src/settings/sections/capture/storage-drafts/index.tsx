import { translate } from '../../../../platform/i18n';
import { settingsSectionClassName } from '../../../section-surface';
import { SettingsSectionHeader } from '../../../section-surface/section-header';
import { StorageDraftsContent } from './content';
import { useStorageDraftsState } from './use-storage-drafts-state';

export function StorageDraftsSection() {
  const state = useStorageDraftsState();
  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.navigation.storageDrafts')}
        title={translate('settings.storageDrafts.title')}
        description={translate('settings.storageDrafts.description')}
      />
      <StorageDraftsContent {...state} />
    </section>
  );
}
