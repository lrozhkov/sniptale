export type RouteResult = {
  handled: boolean;
  keepChannelOpen: boolean;
};

type LifecycleRouteLogger = {
  warn: (message: string, error: unknown) => void;
};

export const HANDLED_SYNC_RESULT: RouteResult = { handled: true, keepChannelOpen: false };

export const HANDLED_ASYNC_RESULT: RouteResult = { handled: true, keepChannelOpen: true };

export const UNHANDLED_RESULT: RouteResult = { handled: false, keepChannelOpen: false };

export function createAsyncLifecycleRoute(
  work: Promise<void>,
  sendResponse: (response: unknown) => void,
  logger: LifecycleRouteLogger,
  failureLogMessage: string
): RouteResult {
  work
    .then(() => sendResponse({ success: true, result: 'accepted' }))
    .catch((error) => {
      logger.warn(failureLogMessage, error);
      sendResponse({ success: false, error: 'Internal error' });
    });
  return HANDLED_ASYNC_RESULT;
}

export function shouldNotifyRecordingStartFailure(
  phase?: 'start' | 'stop' | 'runtime' | 'export'
): boolean {
  return phase === undefined || phase === 'start';
}
