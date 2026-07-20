import type { RuntimeMessageEnvelope } from '../message-guards/guards/shared';
import type { RuntimeMessagePreflightRoute } from '../boundary/preflight';
import type { Action, ActionContext } from './types';

// ROUTING-03 migration rule: this adapter may only bridge the pre-existing
// preflight families into action names. Add new routes through typed
// descriptors and update route-completeness proof instead of growing this file.
export function adaptImmediateLegacyRouteToAction(args: {
  context: ActionContext;
  parsedMessage: RuntimeMessageEnvelope;
  route: Exclude<RuntimeMessagePreflightRoute, { kind: 'tab' }>;
}): Action {
  switch (args.route.kind) {
    case 'internal-signal':
      return {
        actionKind: 'internal-signal',
        context: args.context,
        routeName: 'internal-signal',
      };
    case 'background-owned':
      return {
        actionKind: 'background-owned',
        context: args.context,
        message: args.parsedMessage,
        routeName: `background-owned:${args.parsedMessage.type}`,
      };
    case 'video-runtime':
      return {
        actionKind: 'video-runtime',
        context: args.context,
        message: args.route.message,
        routeName: `video-runtime:${args.route.message.type}`,
      };
    case 'unknown':
      return {
        actionKind: 'unknown',
        context: args.context,
        message: args.parsedMessage,
        routeName: 'unknown',
      };
  }
}

export function adaptTabLegacyRouteToAction(args: {
  context: ActionContext;
  resolvedTabId: number | undefined;
  route: Extract<RuntimeMessagePreflightRoute, { kind: 'tab' }>;
}): Action {
  return {
    actionKind: 'tab',
    context: args.context,
    message: args.route.tabMessage,
    resolvedTabId: args.resolvedTabId,
    routeName: `tab:${args.route.tabMessage.type}`,
  };
}
