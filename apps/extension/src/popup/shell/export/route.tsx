import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { useEffect } from 'react';
import type { PopupStartupDescriptor } from '../startup/descriptor';
import { usePopupPageAccessRuntime } from '../runtime/page-access';
import { useActiveTabCapabilities } from '../tab-access/capabilities';
import { stagePopupExportLaunchSelection } from './selection/launch-selection';
import { ExportPage } from './pages/page';

export function ExportRoute({ startup }: { startup: PopupStartupDescriptor }) {
  const capabilities = useActiveTabCapabilities();
  const pageAccess = usePopupPageAccessRuntime(capabilities);
  useEffect(() => {
    if (startup.page === 'export' && startup.launchSelection) {
      stagePopupExportLaunchSelection(startup.launchSelection);
    }
  }, [startup]);
  return (
    <ExportPage
      isActive
      activeTabCapabilities={capabilities}
      pageAccess={pageAccess}
      {...(startup.page === 'export' && startup.destination
        ? { initialDestination: startup.destination }
        : {})}
    />
  );
}
