import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs } from '../../../section-surface';
import { CaptureResourcesSettings } from './capture-resources';
import { PermissionsSection } from './permissions';
import { PrivacySection } from './privacy';

export function AccessDataSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const view = props.view === 'privacy' ? 'privacy' : 'permissions';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.accessData')}
        items={[
          { id: 'permissions', label: translate('settings.navigation.views.permissions') },
          { id: 'privacy', label: translate('settings.navigation.views.privacy') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'privacy' ? (
        <div className="space-y-5">
          <CaptureResourcesSettings />
          <PrivacySection />
        </div>
      ) : (
        <PermissionsSection />
      )}
    </div>
  );
}
