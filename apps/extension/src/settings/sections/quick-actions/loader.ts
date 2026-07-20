import { useEffect } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { QuickAction, QuickActionsDisplayMode } from '../../../contracts/settings';
import {
  getQuickActions,
  getQuickActionsDisplayMode,
} from '../../../composition/persistence/quick-actions';

const logger = createLogger({ namespace: 'SettingsQuickActions' });

export async function loadQuickActionsState() {
  const [loadedActions, loadedDisplayMode] = await Promise.all([
    getQuickActions(),
    getQuickActionsDisplayMode(),
  ]);

  return { loadedActions, loadedDisplayMode };
}

export function useQuickActionsLoader(props: {
  setActions: (actions: QuickAction[]) => void;
  setDisplayModeState: (value: QuickActionsDisplayMode) => void;
  setIsLoading: (value: boolean) => void;
}) {
  const { setActions, setDisplayModeState, setIsLoading } = props;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      try {
        const { loadedActions, loadedDisplayMode } = await loadQuickActionsState();
        setActions(loadedActions);
        setDisplayModeState(loadedDisplayMode);
      } catch (error) {
        logger.error('Failed to load quick actions', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [setActions, setDisplayModeState, setIsLoading]);
}
