import type { ActionRouteKeepChannelBehaviorSource } from './types';
import type { ActionRouteGroup } from './route-group-types';
import { backgroundOwnedRouteInventory } from './owned-route-inventory';

export const backgroundOwnedRouteGroups = backgroundOwnedRouteInventory.map((entry) =>
  createBackgroundOwnedRouteGroup({
    authorityFamily: entry.routeAuthorityFamily,
    handlerId: entry.handlerId,
    messageTypes: entry.messageTypes,
    ownerModule: entry.ownerModule,
  })
) as readonly ActionRouteGroup[];

function createBackgroundOwnedRouteGroup(
  group: Omit<ActionRouteGroup, 'actionKind' | 'handlerAdapter' | 'keepChannelBehaviorSource'> & {
    readonly handlerId?: string;
    readonly keepChannelBehaviorSource?: ActionRouteKeepChannelBehaviorSource;
  }
): ActionRouteGroup {
  return {
    actionKind: 'background-owned',
    authorityFamily: group.authorityFamily,
    handlerAdapter: 'routeBackgroundOwnedAction',
    keepChannelBehaviorSource: group.keepChannelBehaviorSource ?? 'background-owned-route-handler',
    messageTypes: group.messageTypes,
    ownerModule: group.ownerModule,
  };
}
