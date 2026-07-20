import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { BackgroundRuntimeMessageDeps } from '../boundary/shared';
import type { ActionContext } from './types';

function readOrigin(senderUrl: string | undefined): string | null {
  if (!senderUrl) {
    return null;
  }

  try {
    return new URL(senderUrl).origin;
  } catch {
    return null;
  }
}

export function createActionContext(args: {
  logger: ActionContext['logger'];
  runtimeState: BackgroundRuntimeMessageDeps;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender;
}): ActionContext {
  return {
    documentId: args.sender.documentId ?? null,
    frameId: typeof args.sender.frameId === 'number' ? args.sender.frameId : null,
    logger: args.logger,
    origin: readOrigin(args.sender.url),
    runtimeState: args.runtimeState,
    sendResponse: args.sendResponse,
    sender: args.sender,
    senderUrl: args.sender.url ?? null,
    tabId: typeof args.sender.tab?.id === 'number' ? args.sender.tab.id : null,
  };
}
