import {
  isPageStyleRuntimeMessage,
  routePageStyleRuntimeMessage,
} from '../../../../capture/routes';
import { routeWithPageAccess } from './page-access-guard';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

export function routeResolvedPageStyleMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isPageStyleRuntimeMessage(args.message)) {
    return false;
  }
  if (rejectUnauthorizedRouteSender(args, 'page-style')) {
    return true;
  }

  const message = args.message;
  return routeWithPageAccess(args, () => {
    routePageStyleRuntimeMessage({
      logger: args.logger,
      message,
      resolvedTabId: args.resolvedTabId,
      sendResponse: args.sendResponse,
    });
    return true;
  });
}
