import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { disableHighlighterMode, enableHighlighterMode } from '../../selection/highlighter';
import { disableNavigationLock, setFullLockMode } from '../../selection/locker';
import { disableQuickEditMode, enableQuickEditMode } from '../../selection/quick-edit';
import {
  isCoreModeMessage,
  type ContentRuntimeHandlerResult,
  type CoreModeMessage,
  type ContentRuntimeMessage,
} from './types';

/**
 * Handles core screenshot/highlighter/quick-edit runtime toggles.
 */
export function handleCoreModeMessage(message: ContentRuntimeMessage): ContentRuntimeHandlerResult {
  if (!isCoreModeMessage(message)) {
    return null;
  }

  return handleKnownCoreModeMessage(message);
}

function handleKnownCoreModeMessage(message: CoreModeMessage): false {
  switch (message.type) {
    case MessageType.ENABLE_SCREENSHOT_MODE:
      return false;
    case MessageType.DISABLE_SCREENSHOT_MODE:
      disableNavigationLock();
      return false;
    case MessageType.ENABLE_HIGHLIGHTER_MODE:
      enableHighlighterMode();
      setFullLockMode(true);
      return false;
    case MessageType.DISABLE_HIGHLIGHTER_MODE:
      disableHighlighterMode();
      return false;
    case MessageType.ENABLE_QUICK_EDIT_MODE:
      enableQuickEditMode();
      setFullLockMode(true);
      return false;
    case MessageType.DISABLE_QUICK_EDIT_MODE:
      disableQuickEditMode();
      return false;
  }
}
