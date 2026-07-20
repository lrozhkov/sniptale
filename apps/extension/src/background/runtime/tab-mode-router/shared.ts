import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ResponseSender,
  TabModeMessage,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { WebSnapshotViewerPorts } from '../../capture/lifecycle';
import type { ViewportOwnerState } from '../../routing-contracts/tab-mode-state';

type HighlighterModeMessage =
  | Extract<TabModeMessage, { type: 'ENABLE_HIGHLIGHTER_MODE' }>
  | Extract<TabModeMessage, { type: 'DISABLE_HIGHLIGHTER_MODE' }>
  | Extract<TabModeMessage, { type: 'HIGHLIGHTER_MODE_STATUS' }>;

type QuickEditModeMessage =
  | Extract<TabModeMessage, { type: 'ENABLE_QUICK_EDIT_MODE' }>
  | Extract<TabModeMessage, { type: 'DISABLE_QUICK_EDIT_MODE' }>
  | Extract<TabModeMessage, { type: 'QUICK_EDIT_MODE_STATUS' }>;

type ScreenshotModeMessage =
  | Extract<TabModeMessage, { type: 'ENABLE_SCREENSHOT_MODE' }>
  | Extract<TabModeMessage, { type: 'DISABLE_SCREENSHOT_MODE' }>
  | Extract<TabModeMessage, { type: 'SCREENSHOT_MODE_STATUS' }>;

export function isHighlighterModeMessage(
  message: TabModeMessage
): message is HighlighterModeMessage {
  return (
    message.type === MessageType.ENABLE_HIGHLIGHTER_MODE ||
    message.type === MessageType.DISABLE_HIGHLIGHTER_MODE ||
    message.type === MessageType.HIGHLIGHTER_MODE_STATUS
  );
}

export function isQuickEditModeMessage(message: TabModeMessage): message is QuickEditModeMessage {
  return (
    message.type === MessageType.ENABLE_QUICK_EDIT_MODE ||
    message.type === MessageType.DISABLE_QUICK_EDIT_MODE ||
    message.type === MessageType.QUICK_EDIT_MODE_STATUS
  );
}

export function isScreenshotModeMessage(message: TabModeMessage): message is ScreenshotModeMessage {
  return (
    message.type === MessageType.ENABLE_SCREENSHOT_MODE ||
    message.type === MessageType.DISABLE_SCREENSHOT_MODE ||
    message.type === MessageType.SCREENSHOT_MODE_STATUS
  );
}

export type RouteTabModeMessageArgs = {
  message: TabModeMessage;
  resolvedTabId: number;
  senderDocumentId?: string | null;
  sendResponse: ResponseSender;
  screenshotModeState: Map<number, boolean>;
  highlighterModeState: Map<number, boolean>;
  quickEditModeState: Map<number, boolean>;
  viewportOwnerState: ViewportOwnerState;
  viewportState: Map<number, { width: number; height: number } | null>;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts;
};

export type TabModeContext = Pick<
  RouteTabModeMessageArgs,
  | 'resolvedTabId'
  | 'senderDocumentId'
  | 'sendResponse'
  | 'screenshotModeState'
  | 'highlighterModeState'
  | 'quickEditModeState'
  | 'viewportOwnerState'
  | 'viewportState'
  | 'webSnapshotViewerPorts'
>;
