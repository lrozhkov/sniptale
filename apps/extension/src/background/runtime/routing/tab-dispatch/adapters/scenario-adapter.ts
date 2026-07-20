import { isScenarioMessage } from '../../message-guards/guards/tab';
import { routeScenarioMessage } from '../../../../scenario/routes';
import { routeWithPageAccess } from './page-access-guard';
import { rejectUnauthorizedRouteSender } from './sender-rejection';
import type { ResolvedTabRouteArgs } from './types';

export function routeResolvedScenarioMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isScenarioMessage(args.message)) {
    return false;
  }
  if (rejectUnauthorizedRouteSender(args, 'scenario')) {
    return true;
  }

  const message = args.message;
  return routeWithPageAccess(args, () => {
    return routeScenarioMessage({
      message,
      resolvedTabId: args.resolvedTabId,
      sendResponse: args.sendResponse,
      scenarioSessionService: args.deps.scenarioSessionService,
    });
  });
}
