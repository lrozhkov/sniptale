import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs, useSettingsNavigationLock } from '../../../section-surface';
import { SettingsTransferExportFlow } from './export-flow';
import { SettingsTransferImportFlow } from './import-flow';

type Flow = 'export' | 'import';

export function SettingsTransferSection() {
  const [flow, setFlow] = useState<Flow>('export');
  const { locked: commitBusy } = useSettingsNavigationLock();
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={flow}
        ariaLabel={translate('settings.navigation.settingsTransfer')}
        disabled={commitBusy}
        items={[
          { id: 'export', label: translate('settings.settingsTransfer.exportTab') },
          { id: 'import', label: translate('settings.settingsTransfer.importTab') },
        ]}
        onChange={(next) => setFlow(next === 'import' ? 'import' : 'export')}
      />
      {flow === 'export' ? <SettingsTransferExportFlow /> : <SettingsTransferImportFlow />}
    </div>
  );
}
