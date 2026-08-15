import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import { useEffect, useState } from 'react';
import { loadSettings } from '../../../composition/persistence/settings';
import { getQuickActions } from '../../../composition/persistence/quick-actions';
import type { QuickAction, ViewportPreset } from '../../../contracts/settings';
import { translate } from '../../../platform/i18n/popup';
import type { PopupStartupDescriptor } from '../startup/descriptor';
import { usePopupPageAccessRuntime } from '../runtime/page-access';
import { useActiveTabCapabilities } from '../tab-access/capabilities';
import { PopupHomePage } from './page-shell';

export function ScreenshotsRoute({ startup }: { startup: PopupStartupDescriptor }) {
  const capabilities = useActiveTabCapabilities();
  const pageAccess = usePopupPageAccessRuntime(capabilities);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [quickActionsReady, setQuickActionsReady] = useState(false);
  const [viewportPresets, setViewportPresets] = useState<ViewportPreset[]>([]);
  const [homeError, setHomeError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getQuickActions()
      .then((actions) => {
        if (active) setQuickActions(actions.filter((action) => action.status));
      })
      .catch(() => {
        if (active) setHomeError(translate('popup.home.quickActionsLoadError'));
      })
      .finally(() => {
        if (active) setQuickActionsReady(true);
      });
    void loadSettings().then((settings) => {
      if (active) setViewportPresets(settings.viewportPresets ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PopupHomePage
      quickActions={quickActions}
      quickActionsReady={quickActionsReady}
      viewportPresets={viewportPresets}
      activeTabCapabilities={capabilities}
      homeError={homeError}
      pageAccess={pageAccess}
      startupMode={startup.page === 'screenshots' ? (startup.screenshotMode ?? null) : null}
    />
  );
}
