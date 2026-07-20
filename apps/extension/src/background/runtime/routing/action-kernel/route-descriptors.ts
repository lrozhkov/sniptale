import type { BackgroundOwnedRouteInventoryEntry } from '../../../routing-contracts/owned-route-context';
import { getActionRouteContract } from './route-contracts';
import type { ActionRouteContract } from './route-contract-types';
import type { ActionRouteGroup, ParserSupportedActionKind } from './route-group-types';
import type { ActionRouteAuthorityFamily, ActionRouteMetadata, LegacyRouteName } from './types';

export type BackgroundOwnedRouteDescriptor = BackgroundOwnedRouteInventoryEntry & {
  readonly routeAuthorityFamily: ActionRouteAuthorityFamily;
};

export function createInternalRouteMetadata(
  route: Omit<
    ActionRouteMetadata,
    keyof ActionRouteContract | 'keepChannelBehaviorSource' | 'messageType'
  >
): ActionRouteMetadata {
  return {
    ...route,
    ...getActionRouteContract(route.authorityFamily),
    keepChannelBehaviorSource: 'action-kernel-fixed-closed',
    messageType: null,
  };
}

export function expandRouteDescriptor(group: ActionRouteGroup): readonly ActionRouteMetadata[] {
  return group.messageTypes.map((messageType) => ({
    ...getActionRouteContract(group.authorityFamily),
    actionKind: group.actionKind,
    ...(group.alternateAuthorityFamilies === undefined
      ? {}
      : { alternateAuthorityFamilies: group.alternateAuthorityFamilies }),
    authorityFamily: group.authorityFamily,
    handlerAdapter: group.handlerAdapter,
    keepChannelBehaviorSource: group.keepChannelBehaviorSource,
    messageType,
    ownerModule: group.ownerModule,
    routeName: createRouteName(group.actionKind, messageType),
    support: 'parser-supported',
  }));
}

function createRouteName(
  actionKind: ParserSupportedActionKind,
  messageType: string
): LegacyRouteName {
  return `${actionKind}:${messageType}` as LegacyRouteName;
}
