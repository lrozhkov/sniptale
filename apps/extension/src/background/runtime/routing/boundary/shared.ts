import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { BackgroundRuntimeState } from '../../../application/runtime-state';
import type { BackgroundTabMessage } from '../message-guards/guards/shared';

export type BackgroundRuntimeMessageDeps = BackgroundRuntimeState;

export type TabRouteArgs = {
  deps: BackgroundRuntimeMessageDeps;
  message: BackgroundTabMessage;
  resolvedTabId: number;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
};
