import { routeAuthorizedTabAction } from '../tab-dispatch/adapters/dispatcher';
import type { ActionResult, TabAction } from './types';

export function routeTabAction(action: TabAction): ActionResult {
  routeAuthorizedTabAction({
    deps: action.context.runtimeState,
    logger: {
      error: (...value: unknown[]) => action.context.logger.error?.(...value),
      warn: action.context.logger.warn,
    },
    message: action.message,
    resolvedTabId: action.resolvedTabId,
    sendResponse: action.context.sendResponse,
    sender: action.context.sender,
  });
  return { handled: true, keepChannelOpen: true };
}
