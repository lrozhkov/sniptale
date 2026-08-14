// policyStateIds: [] - this popup-local browser observation is reconstructible capability UI state.
import { useCallback, useEffect, useState } from 'react';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';

export function useActiveTabCapabilities() {
  const [capabilities, setCapabilities] = useState(() => getTabCapabilities(null));
  const refresh = useCallback(async () => {
    try {
      const [tab] = await browserTabs.query({ active: true, currentWindow: true });
      setCapabilities(getTabCapabilities(tab));
    } catch {
      setCapabilities(getTabCapabilities(null));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const disposeActivated = browserTabs.subscribeToActivated(onFocus);
    const disposeUpdated = browserTabs.subscribeToUpdated((_tabId, change, tab) => {
      if (tab.active && (change.status === 'complete' || typeof change.url === 'string')) {
        void refresh();
      }
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      disposeActivated();
      disposeUpdated();
    };
  }, [refresh]);

  return capabilities;
}
