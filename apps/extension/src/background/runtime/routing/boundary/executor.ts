import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageEnvelope } from '../message-guards/guards/shared';
import {
  adaptImmediateLegacyRouteToAction,
  createActionContext,
  dispatchAction,
} from '../action-kernel';
import { getBackgroundIngressDescriptor } from '../../../../contracts/messaging/contracts/runtime';
import type { BackgroundRuntimeMessageDeps } from './shared';
import type { RuntimeMessagePreflightRoute } from './preflight';

type ImmediateRouteResult = { done: true; keepChannelOpen: boolean } | { done: false };

export function executeImmediateRuntimeRoute(args: {
  logger: { warn: (...value: unknown[]) => void };
  parsedMessage: RuntimeMessageEnvelope;
  route: Exclude<RuntimeMessagePreflightRoute, { kind: 'tab' }>;
  runtimeState: BackgroundRuntimeMessageDeps;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender;
}): ImmediateRouteResult {
  const context = createActionContext({
    logger: args.logger,
    runtimeState: args.runtimeState,
    sendResponse: args.sendResponse,
    sender: args.sender,
  });
  const descriptor = getBackgroundIngressDescriptor(args.parsedMessage.type);
  const action =
    args.route.kind === 'video-runtime' &&
    descriptor?.classification === 'routed' &&
    (descriptor.handlerId === 'project-export-runtime' ||
      descriptor.handlerId === 'project-export-capabilities')
      ? {
          actionKind: 'video-runtime' as const,
          context,
          message: args.route.message,
          routeName: `video-runtime:${args.route.message.type}` as const,
        }
      : adaptImmediateLegacyRouteToAction({
          context,
          parsedMessage: args.parsedMessage,
          route: args.route,
        });
  const result = dispatchAction(action);
  return result.handled ? { done: true, keepChannelOpen: result.keepChannelOpen } : { done: false };
}
