// policyStateIds: [] - this popup-local browser observation is reconstructible capability UI state.
import { useCallback, useEffect, useState } from 'react';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';

export function useActiveTabCapabilities(targetTabId?: number) {
  const [capabilities, setCapabilities] = useState(() => getTabCapabilities(null));
  const refresh = useCallback(async () => {
    try {
      const tab =
        targetTabId === undefined
          ? (await browserTabs.query({ active: true, currentWindow: true }))[0]
          : await browserTabs.get(targetTabId);
      setCapabilities(getTabCapabilities(tab));
    } catch {
      setCapabilities(getTabCapabilities(null));
    }
  }, [targetTabId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const disposeActivated = browserTabs.subscribeToActivated(onFocus);
    const disposeUpdated = browserTabs.subscribeToUpdated((tabId, change, tab) => {
      if (
        (targetTabId === undefined ? tab.active : targetTabId === tabId) &&
        (change.status === 'complete' || typeof change.url === 'string')
      ) {
        void refresh();
      }
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      disposeActivated();
      disposeUpdated();
    };
  }, [refresh, targetTabId]);

  return capabilities;
}
