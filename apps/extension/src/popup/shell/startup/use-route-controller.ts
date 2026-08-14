import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { PopupPage } from '../navigation/actions';
import type { PopupStartupDescriptor } from './descriptor';
import { loadPopupRoute } from './resource';

type PopupRouteComponent = ComponentType<{ startup: PopupStartupDescriptor }>;
type CommittedRoute = {
  page: PopupPage;
  Route: PopupRouteComponent;
  startup: PopupStartupDescriptor;
};
type RouteLoadError = { descriptor: PopupStartupDescriptor | null };

export function usePopupRouteController() {
  const [page, setPage] = useState<PopupPage | null>(null);
  const [route, setRoute] = useState<PopupRouteComponent | null>(null);
  const [startup, setStartup] = useState<PopupStartupDescriptor | null>(null);
  const [pendingPage, setPendingPage] = useState<PopupPage | null>(null);
  const [routeLoadError, setRouteLoadError] = useState<RouteLoadError | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const navigationIntent = useRef(0);
  const persistenceRevision = useRef(0);
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());
  const persistedRoute = useRef<CommittedRoute | null>(null);
  const mounted = useRef(true);

  const navigateToDescriptor = useCallback(
    async (descriptor: PopupStartupDescriptor) => {
      const target = descriptor.page;
      if (target === page && route) {
        setStartup(descriptor);
        setRouteLoadError(null);
        if (persistedRoute.current?.page === target) {
          persistedRoute.current = { ...persistedRoute.current, startup: descriptor };
        }
        return;
      }
      const intent = ++navigationIntent.current;
      const navigationMark = `sniptale-popup-navigation-${target}-${intent}`;
      performance.mark(navigationMark);
      setPendingPage(target);
      setRouteLoadError(null);
      let component: PopupRouteComponent;
      try {
        component = await loadPopupRoute(descriptor);
      } catch {
        if (navigationIntent.current === intent) {
          setPendingPage(null);
          setRouteLoadError({ descriptor });
        }
        return;
      }
      if (navigationIntent.current !== intent) return;
      setStartup(descriptor);
      setRoute(() => component);
      setPage(target);
      setPendingPage(null);
      setRouteLoadError(null);
      window.requestAnimationFrame(() => {
        performance.measure(`sniptale-popup-navigation-to-frame-${target}`, navigationMark);
      });
      const committed = { page: target, Route: component, startup: descriptor };
      const revision = ++persistenceRevision.current;
      persistenceQueue.current = persistenceQueue.current.then(async () => {
        try {
          const { savePopupLastPage } =
            await import('../../../composition/persistence/capture-settings/popup-startup');
          await savePopupLastPage(target);
          persistedRoute.current = committed;
        } catch (error) {
          if (mounted.current && persistenceRevision.current === revision) {
            const previous = persistedRoute.current;
            if (previous) {
              setStartup(previous.startup);
              setRoute(() => previous.Route);
              setPage(previous.page);
            }
            void showNavigationPersistenceError(error).catch(() => undefined);
          }
        }
      });
    },
    [page, route]
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const intent = navigationIntent.current;
    void import('./coordinator')
      .then(async ({ resolvePopupStartupRoute }) => {
        const descriptor = await resolvePopupStartupRoute();
        if (!active || navigationIntent.current !== intent) return;
        setPendingPage(descriptor.page);
        let component: PopupRouteComponent;
        try {
          component = await loadPopupRoute(descriptor);
        } catch {
          if (active && navigationIntent.current === intent) {
            setPendingPage(null);
            setRouteLoadError({ descriptor });
          }
          return;
        }
        if (active && navigationIntent.current === intent) {
          setPage(descriptor.page);
          setStartup(descriptor);
          setRoute(() => component);
          setPendingPage(null);
          setRouteLoadError(null);
          persistedRoute.current = { page: descriptor.page, Route: component, startup: descriptor };
        }
      })
      .catch(() => {
        if (active && navigationIntent.current === intent) {
          setPendingPage(null);
          setRouteLoadError({ descriptor: null });
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [startupAttempt]);

  useRecordingNavigationSync(page, navigateToDescriptor, setStartup);
  useCorrectRouteFrameMark(page, route);

  return {
    navigate: (target: PopupPage) =>
      navigateToDescriptor({ page: target } as PopupStartupDescriptor),
    page,
    pendingPage,
    routeLoadError,
    retryRouteLoad: () => {
      const descriptor = routeLoadError?.descriptor;
      if (descriptor) void navigateToDescriptor(descriptor);
      else {
        setRouteLoadError(null);
        setStartupAttempt((attempt) => attempt + 1);
      }
    },
    Route: route,
    startup,
  };
}

function useCorrectRouteFrameMark(page: PopupPage | null, route: PopupRouteComponent | null): void {
  useEffect(() => {
    if (!route) return;
    const frame = window.requestAnimationFrame(() => {
      performance.mark(`sniptale-popup-correct-route-frame-${page ?? 'unknown'}`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, route]);
}

function useRecordingNavigationSync(
  page: PopupPage | null,
  navigateToDescriptor: (descriptor: PopupStartupDescriptor) => Promise<void>,
  setStartup: Dispatch<SetStateAction<PopupStartupDescriptor | null>>
): void {
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void import('../message-sync').then(({ subscribeToRecordingMessages }) => {
      const unsubscribe = subscribeToRecordingMessages({
        onRecordingState: (recordingState) => {
          if (recordingState.status !== 'IDLE' || page === 'video') {
            void navigateToDescriptor({ page: 'video', recordingSeed: recordingState });
          }
        },
        onRecordingStartFailed: (error) => {
          if (page === 'video') {
            setStartup({
              page: 'video',
              recordingStartFailed: true,
              ...(error ? { startError: error } : {}),
            });
          }
        },
      });
      if (!active) {
        unsubscribe();
        return;
      }
      dispose = unsubscribe;
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [navigateToDescriptor, page, setStartup]);
}

async function showNavigationPersistenceError(error: unknown): Promise<void> {
  const [{ createLogger }, { toast }, { translate }] = await Promise.all([
    import('@sniptale/platform/observability/logger'),
    import('@sniptale/ui/product-feedback/toast-service'),
    import('../../../platform/i18n/popup'),
  ]);
  createLogger({ namespace: 'PopupRouteController' }).error('Failed to persist popup page', error);
  toast.error(translate('common.states.error'));
}
