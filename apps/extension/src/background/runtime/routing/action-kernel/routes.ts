import { backgroundIngressContracts } from '../../../../contracts/messaging/contracts/runtime';
import type { ActionKind, ActionRouteMetadata, LegacyRouteName } from './types';

type ParserSupportedActionKind = Exclude<ActionKind, 'internal-signal' | 'unknown'>;

export const actionRouteMetadata = [
  {
    acceptedSenderClass: 'background runtime internals',
    actionKind: 'internal-signal',
    authorityFamily: 'internal-signal',
    errorShape: 'none',
    freshnessReplayPolicy: 'internal service-worker lifecycle only',
    handlerAdapter: 'routeInternalSignalAction',
    handlerId: 'internal-signal',
    keepChannelBehaviorSource: 'action-kernel-fixed-closed',
    messageType: null,
    ownerModule: 'apps/extension/src/background/runtime/routing/boundary/preflight.ts',
    requiredAuthority: 'internal preflight signal',
    responseShape: 'no external response contract',
    routeName: 'internal-signal',
    sideEffects: 'runtime initialization or lifecycle side effects',
    support: 'internal',
    transitiveStateOwner: 'background runtime wiring owners',
  },
  {
    acceptedSenderClass: 'none',
    actionKind: 'unknown',
    authorityFamily: 'unsupported',
    errorShape: 'unsupported action route error response',
    freshnessReplayPolicy: 'unsupported routes fail closed before side effects',
    handlerAdapter: 'routeUnknownAction',
    handlerId: 'unknown',
    keepChannelBehaviorSource: 'action-kernel-fixed-closed',
    messageType: null,
    ownerModule: 'apps/extension/src/background/runtime/routing/boundary/preflight.ts',
    requiredAuthority: 'none',
    responseShape: 'standard unsupported route failure',
    routeName: 'unknown',
    sideEffects: 'none',
    support: 'unsupported',
    transitiveStateOwner: 'none',
  },
  ...backgroundIngressContracts
    .filter((entry) => entry.classification === 'routed')
    .map(
      (entry): ActionRouteMetadata => ({
        acceptedSenderClass: entry.acceptedSenderClass,
        actionKind: entry.actionKind,
        ...(entry.alternateAuthorityFamilies.length === 0
          ? {}
          : { alternateAuthorityFamilies: entry.alternateAuthorityFamilies }),
        authorityFamily: entry.routeAuthorityFamily,
        errorShape: entry.errorShape,
        freshnessReplayPolicy: entry.freshnessReplayPolicy,
        handlerAdapter: handlerAdapterForActionKind(entry.actionKind),
        handlerId: entry.handlerId,
        keepChannelBehaviorSource: entry.keepChannelBehaviorSource,
        messageType: entry.type,
        ownerModule: entry.ownerModule,
        requiredAuthority: entry.requiredAuthority,
        responseShape: entry.responseShape,
        routeName: `${entry.actionKind}:${entry.type}` as LegacyRouteName,
        sideEffects: entry.sideEffects,
        support: 'parser-supported' as const,
        transitiveStateOwner: entry.transitiveStateOwner,
      })
    ),
] as const satisfies readonly ActionRouteMetadata[];

function handlerAdapterForActionKind(
  actionKind: ParserSupportedActionKind
): ActionRouteMetadata['handlerAdapter'] {
  switch (actionKind) {
    case 'background-owned':
      return 'routeBackgroundOwnedAction';
    case 'tab':
      return 'routeTabAction';
    case 'video-runtime':
      return 'routeVideoRuntimeAction';
  }
}

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
