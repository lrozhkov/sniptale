import { getErrorMessage } from '../../platform/runtime-messaging';
import type { createLogger } from '@sniptale/platform/observability/logger';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';

interface RouteSuccessResponse {
  result: 'accepted';
  success: true;
}

interface RouteErrorResponse {
  error: string;
  success: false;
}

type RouteResponse<TResponse> = TResponse | RouteErrorResponse;
type RouteLogger = Pick<ReturnType<typeof createLogger>, 'error'>;

export function createRouteErrorResponse(
  error: unknown,
  fallbackMessage?: string
): RouteErrorResponse {
  return {
    error: getErrorMessage(error, fallbackMessage ?? String(error)),
    success: false,
  };
}

/**
 * Sends a canonical async route result and normalizes failures through the shared error seam.
 */
export function respondAsyncRoute<TResponse>(
  work: Promise<TResponse>,
  sendResponse: ResponseSender<RouteResponse<TResponse>>
): void {
  work
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse(createRouteErrorResponse(error));
    });
}

export function respondAsyncRouteWithLogger<TResponse>(args: {
  work: Promise<TResponse>;
  sendResponse: ResponseSender<RouteResponse<TResponse>>;
  logger: RouteLogger;
  failureLogMessage: string;
  fallbackMessage?: string;
}): void {
  args.work
    .then((response) => {
      args.sendResponse(response);
    })
    .catch((error) => {
      args.logger.error(args.failureLogMessage, error);
      args.sendResponse(createRouteErrorResponse(error, args.fallbackMessage));
    });
}

export function respondAsyncRouteEffect(args: {
  work: Promise<void>;
  sendResponse: ResponseSender<RouteErrorResponse>;
  logger: RouteLogger;
  failureLogMessage: string;
  fallbackMessage?: string;
}): void {
  args.work.catch((error) => {
    args.logger.error(args.failureLogMessage, error);
    args.sendResponse(createRouteErrorResponse(error, args.fallbackMessage));
  });
}

/**
 * Wraps async route work that only reports a success/error contract.
 */
export function respondAsyncSuccess(
  work: Promise<void>,
  sendResponse: ResponseSender<RouteSuccessResponse | RouteErrorResponse>
): void {
  respondAsyncRoute(
    work.then(() => ({ success: true, result: 'accepted' }) satisfies RouteSuccessResponse),
    sendResponse
  );
}
