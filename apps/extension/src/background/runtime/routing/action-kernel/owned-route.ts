import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { authorizeBackgroundOwnedRouteMaybeAsync } from '../authorization/owned';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';
import { getBackgroundOwnedRouteContext } from '../../../routing-contracts/owned-route-context';
import { dispatchBackgroundOwnedRoute } from './owned-route-handlers';
import type { ActionResult, BackgroundOwnedAction } from './types';

export function routeBackgroundOwnedAction(action: BackgroundOwnedAction): ActionResult {
  const authorization = authorizeBackgroundOwnedAction(action);
  if (!isPromise(authorization)) {
    return routeAuthorizedBackgroundOwnedAction(action, authorization);
  }

  void authorization.then(
    (authorization) => {
      routeAuthorizedBackgroundOwnedAction(action, authorization);
    },
    (error) => {
      action.context.logger.error?.('Background-owned authorization failed', error);
      action.context.sendResponse(
        createRouteErrorResponse('Background-owned authorization failed')
      );
    }
  );
  return { handled: true, keepChannelOpen: true };
}

function routeAuthorizedBackgroundOwnedAction(
  action: BackgroundOwnedAction,
  authorization: IpcAuthorizationResult
): ActionResult {
  if (!authorization.authorized) {
    action.context.logger.warn('Rejected background-owned runtime message');
    action.context.sendResponse(createRouteErrorResponse(authorization.reason));
    return { handled: true, keepChannelOpen: false };
  }

  const result = dispatchBackgroundOwnedRoute(
    action,
    getBackgroundOwnedRouteContext(authorization.preauthorization)
  );
  if (!result.handled) {
    action.context.logger.warn('Background-owned route declined message', {
      routeName: action.routeName,
    });
    action.context.sendResponse(createRouteErrorResponse('Unsupported action route'));
    return { handled: true, keepChannelOpen: false };
  }
  return result;
}

function authorizeBackgroundOwnedAction(action: BackgroundOwnedAction) {
  return authorizeBackgroundOwnedRouteMaybeAsync({
    kind: 'background-owned',
    message: action.message,
    sender: action.context.sender,
  });
}

function isPromise<TValue>(value: TValue | Promise<TValue>): value is Promise<TValue> {
  return typeof (value as { then?: unknown }).then === 'function';
}
