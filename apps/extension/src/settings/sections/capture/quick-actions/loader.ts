import { useEffect } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { QuickAction } from '../../../../contracts/settings';
import { getQuickActions } from '../../../../composition/persistence/quick-actions';

const logger = createLogger({ namespace: 'SettingsQuickActions' });

export function useQuickActionsLoader(props: {
  setActions: (actions: QuickAction[]) => void;
  setIsLoading: (value: boolean) => void;
}) {
  const { setActions, setIsLoading } = props;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      try {
        setActions(await getQuickActions());
      } catch (error) {
        logger.error('Failed to load quick actions', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [setActions, setIsLoading]);
}
