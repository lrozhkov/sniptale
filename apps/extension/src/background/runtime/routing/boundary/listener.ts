import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { respondAsyncRouteEffect } from '../../../routing-contracts/response';
import type { RuntimeMessageEnvelope } from '../message-guards/guards/shared';
import { adaptTabLegacyRouteToAction, createActionContext, dispatchAction } from '../action-kernel';
import { parseRuntimeMessage } from './parser';
import { executeImmediateRuntimeRoute } from './executor';
import { classifyRuntimeMessageRoute, type RuntimeMessagePreflightRoute } from './preflight';
import { resolveTabIdPromise } from '../tab-dispatch/adapters/tab-id';
import type { BackgroundRuntimeMessageDeps } from './shared';

const logger = createLogger({ namespace: 'BackgroundRuntimeMessaging' });

/**
 * Registers the background runtime message boundary and routes validated messages into the runtime.
 */
export function registerBackgroundRuntimeMessageListener(deps: BackgroundRuntimeMessageDeps): void {
  browserRuntime.subscribeToMessages((message, sender, sendResponse) =>
    handleRuntimeMessage(message, sender, sendResponse, deps)
  );
}

function handleRuntimeMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  deps: BackgroundRuntimeMessageDeps
): boolean {
  const parsedMessage = parseRuntimeMessage({
    logger,
    message,
    sender,
    sendResponse,
  });
  if (!parsedMessage) {
    return false;
  }

  logIncomingMessage(parsedMessage, sender);

  const route = classifyRuntimeMessageRoute(parsedMessage);
  if (route.kind === 'tab') {
    return routeTabRuntimeMessage({ deps, route, sendResponse, sender });
  }

  return routeImmediateRuntimeMessage({
    deps,
    parsedMessage,
    route,
    sendResponse,
    sender,
  });
}

function routeTabRuntimeMessage(args: {
  deps: BackgroundRuntimeMessageDeps;
  route: Extract<RuntimeMessagePreflightRoute, { kind: 'tab' }>;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender;
}): boolean {
  respondAsyncRouteEffect({
    work: resolveTabIdPromise(args.route.tabMessage, args.sender).then((resolvedTabId) => {
      dispatchAction(
        adaptTabLegacyRouteToAction({
          context: createActionContext({
            logger,
            runtimeState: args.deps,
            sendResponse: args.sendResponse,
            sender: args.sender,
          }),
          resolvedTabId,
          route: args.route,
        })
      );
    }),
    sendResponse: args.sendResponse,
    logger,
    failureLogMessage: 'Background runtime message handling failed',
    fallbackMessage: 'Internal error',
  });

  return true;
}

function routeImmediateRuntimeMessage(args: {
  deps: BackgroundRuntimeMessageDeps;
  parsedMessage: RuntimeMessageEnvelope;
  route: Exclude<RuntimeMessagePreflightRoute, { kind: 'tab' }>;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender;
}): boolean {
  const immediateRoute = executeImmediateRuntimeRoute({
    logger,
    parsedMessage: args.parsedMessage,
    route: args.route,
    runtimeState: args.deps,
    sendResponse: args.sendResponse,
    sender: args.sender,
  });
  if (immediateRoute.done) {
    return immediateRoute.keepChannelOpen;
  }

  return false;
}

function logIncomingMessage(message: { type: string }, sender: chrome.runtime.MessageSender): void {
  logger.debug('Received background runtime message', {
    senderTabId: sender.tab?.id,
    type: message.type,
  });
}
