import { backgroundOwnedRouteGroups } from './owned-route-groups';
import type { ParserSupportedActionKind } from './route-group-types';
import { tabRouteGroups } from './tab-route-groups';
import { videoRuntimeRouteGroups } from './video-runtime-route-groups';
import { createInternalRouteMetadata, expandRouteDescriptor } from './route-descriptors';
import type { ActionRouteMetadata, LegacyRouteName } from './types';

export const actionRouteMetadata = [
  createInternalRouteMetadata({
    actionKind: 'internal-signal',
    authorityFamily: 'internal-signal',
    handlerAdapter: 'routeInternalSignalAction',
    ownerModule: 'apps/extension/src/background/runtime/routing/boundary/preflight.ts',
    routeName: 'internal-signal',
    support: 'internal',
  }),
  createInternalRouteMetadata({
    actionKind: 'unknown',
    authorityFamily: 'unsupported',
    handlerAdapter: 'routeUnknownAction',
    ownerModule: 'apps/extension/src/background/runtime/routing/boundary/preflight.ts',
    routeName: 'unknown',
    support: 'unsupported',
  }),
  ...backgroundOwnedRouteGroups.flatMap(expandRouteDescriptor),
  ...tabRouteGroups.flatMap(expandRouteDescriptor),
  ...videoRuntimeRouteGroups.flatMap(expandRouteDescriptor),
] as const satisfies readonly ActionRouteMetadata[];

export function getActionRouteMetadata(
  routeName: LegacyRouteName
): ActionRouteMetadata | undefined {
  return actionRouteMetadata.find((entry) => entry.routeName === routeName);
}

export function getActionRouteMessageTypesByKind(
  actionKind: ParserSupportedActionKind
): readonly string[] {
  return actionRouteMetadata
    .filter((entry) => entry.actionKind === actionKind && entry.messageType !== null)
    .map((entry) => entry.messageType as string);
}
