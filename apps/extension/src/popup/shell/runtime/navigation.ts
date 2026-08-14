import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { finishPopupPerfSpanOnNextFrame, startPopupPerfSpan } from '../../diagnostics/performance';
import { isPopupPagePreloaded, preloadPopupPage as preloadPopupRoute } from '../lazy-chunks';
import type { PopupPage } from '../navigation/actions';
import type { PopupNavigationResult, PopupNavigationSource } from './types/navigation';

const logger = createLogger({ namespace: 'PopupNavigation' });

export function usePopupNavigationState(
  page: PopupPage,
  setPage: Dispatch<SetStateAction<PopupPage>>
) {
  const [pendingPage, setPendingPage] = useState<PopupPage | null>(null);
  const intentRevisionRef = useRef(0);
  const pendingNavigationRef = useRef<{
    promise: Promise<PopupNavigationResult>;
    target: PopupPage;
  } | null>(null);
  const latestNavigationRef = useRef<Promise<PopupNavigationResult> | null>(null);

  const preloadPage = useCallback(async (target: PopupPage): Promise<void> => {
    try {
      await preloadPopupRoute(target);
    } catch (error) {
      logger.error('Failed to preload popup page', error);
    }
  }, []);

  const navigateToPage = useCallback(
    (
      target: PopupPage,
      source: PopupNavigationSource = 'programmatic'
    ): Promise<PopupNavigationResult> => {
      const pendingNavigation = pendingNavigationRef.current;
      if (pendingNavigation?.target === target) return pendingNavigation.promise;

      const revision = ++intentRevisionRef.current;
      if (target === page) {
        pendingNavigationRef.current = null;
        setPendingPage(null);
        const unchangedResult = Promise.resolve<PopupNavigationResult>('unchanged');
        latestNavigationRef.current = unchangedResult;
        return unchangedResult;
      }

      const preloaded = isPopupPagePreloaded(target);
      const span = startPopupPerfSpan('popup.navigation.first-frame');
      setPendingPage(target);
      const promise = (async (): Promise<PopupNavigationResult> => {
        const resolveSupersededOutcome = (): Promise<PopupNavigationResult> | 'superseded' => {
          span?.end({ preloaded, source, superseded: true, target });
          const winningNavigation = latestNavigationRef.current;
          return winningNavigation && winningNavigation !== promise
            ? winningNavigation
            : 'superseded';
        };
        try {
          await preloadPopupRoute(target);
          if (intentRevisionRef.current !== revision) return resolveSupersededOutcome();
          setPage(target);
          setPendingPage(null);
          finishPopupPerfSpanOnNextFrame(span, { preloaded, source, target });
          return 'committed';
        } catch (error) {
          if (intentRevisionRef.current !== revision) return resolveSupersededOutcome();
          setPendingPage(null);
          span?.fail(error, { preloaded, source, target });
          logger.error('Failed to navigate to popup page', error);
          toast.error(translate('common.states.error'));
          return 'failed';
        }
      })();
      pendingNavigationRef.current = { promise, target };
      latestNavigationRef.current = promise;
      void promise.then(() => {
        if (pendingNavigationRef.current?.promise === promise) {
          pendingNavigationRef.current = null;
        }
      });
      return promise;
    },
    [page, setPage]
  );

  return { navigateToPage, pendingPage, preloadPage };
}
