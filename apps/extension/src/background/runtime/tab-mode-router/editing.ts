import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabModeMessage } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabModeContext } from './shared';
import { isHighlighterModeMessage, isQuickEditModeMessage } from './shared';

export function routeHighlighterMessage(message: TabModeMessage, context: TabModeContext): boolean {
  if (!isHighlighterModeMessage(message)) {
    return false;
  }

  switch (message.type) {
    case MessageType.ENABLE_HIGHLIGHTER_MODE:
      context.highlighterModeState.set(context.resolvedTabId, true);
      context.sendResponse({ success: true, result: 'accepted' });
      return true;

    case MessageType.DISABLE_HIGHLIGHTER_MODE:
      context.highlighterModeState.delete(context.resolvedTabId);
      context.sendResponse({ success: true, result: 'accepted' });
      return true;

    case MessageType.HIGHLIGHTER_MODE_STATUS:
      context.sendResponse({
        success: true,
        enabled: context.highlighterModeState.get(context.resolvedTabId) || false,
      });
      return true;
  }

  return false;
}

export function routeQuickEditMessage(message: TabModeMessage, context: TabModeContext): boolean {
  if (!isQuickEditModeMessage(message)) {
    return false;
  }

  switch (message.type) {
    case MessageType.ENABLE_QUICK_EDIT_MODE:
      context.quickEditModeState.set(context.resolvedTabId, true);
      context.sendResponse({ success: true, result: 'accepted' });
      return true;

    case MessageType.DISABLE_QUICK_EDIT_MODE:
      context.quickEditModeState.delete(context.resolvedTabId);
      context.sendResponse({ success: true, result: 'accepted' });
      return true;

    case MessageType.QUICK_EDIT_MODE_STATUS:
      context.sendResponse({
        success: true,
        enabled: context.quickEditModeState.get(context.resolvedTabId) || false,
      });
      return true;
  }

  return false;
}
