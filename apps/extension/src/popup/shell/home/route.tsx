import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
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
  const [showQuickActions, setShowQuickActions] = useState(true);
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
    let epoch = 0;
    const loadPreferences = async () => {
      const version = ++epoch;
      try {
        const settings = await loadSettings();
        if (active && epoch === version) {
          setViewportPresets(settings.viewportPresets ?? []);
          setShowQuickActions(
            normalizePageLaunchPreferences(settings.pageLaunch).quickActionsPopup
          );
        }
      } catch {
        if (active) setHomeError(translate('popup.home.quickActionsLoadError'));
      }
    };
    void loadPreferences();
    const unsubscribe = browserStorage.canObserveChanges()
      ? browserStorage.subscribeToChanges((changes, area) => {
          if (area === 'sync' && changes['sniptale_settings']) void loadPreferences();
        })
      : () => undefined;
    return () => {
      active = false;
      ++epoch;
      unsubscribe();
    };
  }, []);

  return (
    <PopupHomePage
      quickActions={showQuickActions ? quickActions : []}
      quickActionsReady={quickActionsReady}
      viewportPresets={viewportPresets}
      activeTabCapabilities={capabilities}
      homeError={homeError}
      pageAccess={pageAccess}
      startupMode={startup.page === 'screenshots' ? (startup.screenshotMode ?? null) : null}
    />
  );
}
