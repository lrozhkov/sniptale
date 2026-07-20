import { useCallback, useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isPageStyleRulesUiEnabled } from '../../../platform/config/page-style-rules-access';
import { getCurrentPageAppliedStyleCount, openAppliedPageStyles } from './applied-styles-actions';

const logger = createLogger({ namespace: 'PopupAppliedPageStylesEntrypoint' });

export function useAppliedPageStylesEntrypoint(): {
  handleOpenAppliedStyles: () => void;
  showAppliedStylesAction: boolean;
} {
  const [showAppliedStylesAction, setShowAppliedStylesAction] = useState(false);
  const rulesUiEnabled = isPageStyleRulesUiEnabled();

  useEffect(() => {
    if (!rulesUiEnabled) {
      setShowAppliedStylesAction(false);
      return undefined;
    }

    let stale = false;

    getCurrentPageAppliedStyleCount()
      .then((count) => {
        if (!stale) {
          setShowAppliedStylesAction(count > 0);
        }
      })
      .catch((error: unknown) => {
        if (!stale) {
          setShowAppliedStylesAction(false);
          logger.debug('Hiding applied page styles action after summary failure', error);
        }
      });

    return () => {
      stale = true;
    };
  }, [rulesUiEnabled]);

  const handleOpenAppliedStyles = useCallback(() => {
    if (!rulesUiEnabled) {
      return;
    }

    void openAppliedPageStyles().catch((error: unknown) => {
      logger.warn('Failed to open applied page styles inspector', error);
    });
  }, [rulesUiEnabled]);

  return {
    handleOpenAppliedStyles,
    showAppliedStylesAction: rulesUiEnabled && showAppliedStylesAction,
  };
}
