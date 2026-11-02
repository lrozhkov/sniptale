import { SecretProtectionView } from '../../../secret-protection/view';
import { useSettingsSecretProtection } from '../../../secret-protection/context';
import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs } from '../../../section-surface';
import { PermissionsSection } from './permissions';
import { PrivacySection } from './privacy';

function ProtectionConfiguration() {
  const state = useSettingsSecretProtection();
  return <SecretProtectionView state={state} />;
}

export function AccessDataSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const view =
    props.view === 'secret-protection' ||
    props.view === 'privacy' ||
    props.view === 'required-permissions'
      ? props.view
      : 'permissions';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.accessData')}
        items={[
          { id: 'permissions', label: translate('settings.permissions.statusChecksTitle') },
          {
            id: 'required-permissions',
            label: translate('settings.permissions.requiredGrantsTitle'),
          },
          { id: 'privacy', label: translate('settings.navigation.views.privacy') },
          {
            id: 'secret-protection',
            label: translate('settings.navigation.views.secretProtection'),
          },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'secret-protection' ? (
        <ProtectionConfiguration />
      ) : view === 'privacy' ? (
        <PrivacySection />
      ) : (
        <PermissionsSection view={view === 'required-permissions' ? 'required' : 'optional'} />
      )}
    </div>
  );
}
