import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { getActionRouteHandler } from './registry';
import type { Action, ActionResult } from './types';

export function dispatchAction(action: Action): ActionResult {
  const handler = getActionRouteHandler(action.routeName);
  if (!handler) {
    action.context.logger.warn('Missing background action handler', {
      routeName: action.routeName,
    });
    action.context.sendResponse(createRouteErrorResponse('Unsupported action route'));
    return { handled: true, keepChannelOpen: false };
  }

  const result = handler(action);
  if (result.handled) {
    return result;
  }

  action.context.logger.warn('Background action route declined message', {
    routeName: action.routeName,
  });
  action.context.sendResponse(createRouteErrorResponse('Unsupported action route'));
  return { handled: true, keepChannelOpen: false };
}
