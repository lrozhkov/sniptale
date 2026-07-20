import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageEnvelope } from '../message-guards/guards/shared';
import {
  adaptImmediateLegacyRouteToAction,
  createActionContext,
  dispatchAction,
} from '../action-kernel';
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
  const action = adaptImmediateLegacyRouteToAction({
    context,
    parsedMessage: args.parsedMessage,
    route: args.route,
  });
  const result = dispatchAction(action);
  return result.handled ? { done: true, keepChannelOpen: result.keepChannelOpen } : { done: false };
}
