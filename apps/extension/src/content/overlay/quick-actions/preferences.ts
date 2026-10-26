import { isBridgedMouseEvent } from '../../platform/trusted-events/synthetic-mouse';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { normalizePageLaunchPreferences, type PageCorner } from '../../../contracts/page-launch';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../application/runtime-services/services';

/** Observe accepted settings without writing defaults while opening a content surface. */
export function usePageLaunchPreferences() {
  const [preferences, setPreferences] = useState(() => normalizePageLaunchPreferences(undefined));
  const epoch = useRef(0);
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    const version = ++epoch.current;
    const stored = await browserStorage.sync.get(['sniptale_settings']);
    const settings: unknown = stored['sniptale_settings'];
    const raw: unknown =
      typeof settings === 'object' && settings !== null
        ? Object.getOwnPropertyDescriptor(settings, 'pageLaunch')?.value
        : undefined;
    if (mounted.current && epoch.current === version)
      setPreferences(normalizePageLaunchPreferences(raw));
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = browserStorage.canObserveChanges()
      ? browserStorage.subscribeToChanges((changes, area) => {
          if (area === 'sync' && changes['sniptale_settings']) void reload().catch(() => undefined);
        })
      : () => undefined;
    void reload().catch(() => undefined);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [reload]);
  const saveCorner = useCallback(
    async (corner: PageCorner, event: Event) => {
      if (!event.isTrusted && !isBridgedMouseEvent(event))
        throw new Error('Trusted corner gesture required');
      const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
        type: MessageType.PAGE_LAUNCH_PREFERENCES,
        corner,
      });
      if (!response?.success) throw new Error('Page corner could not be saved');
      await reload();
    },
    [reload]
  );
  return { preferences, saveCorner };
}
