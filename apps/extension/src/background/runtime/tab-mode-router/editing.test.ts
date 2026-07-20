import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeHighlighterMessage, routeQuickEditMessage } from './editing';
import type { TabModeContext } from './shared';

function createContext(): TabModeContext {
  return {
    resolvedTabId: 7,
    sendResponse: vi.fn(),
    screenshotModeState: new Map<number, boolean>(),
    highlighterModeState: new Map<number, boolean>(),
    quickEditModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
}

it('routes highlighter mode state transitions and status responses', () => {
  const enableContext = createContext();
  expect(
    routeHighlighterMessage({ type: MessageType.ENABLE_HIGHLIGHTER_MODE }, enableContext)
  ).toBe(true);
  expect(enableContext.highlighterModeState.get(7)).toBe(true);
  expect(enableContext.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const statusContext = createContext();
  statusContext.highlighterModeState.set(7, true);
  expect(
    routeHighlighterMessage({ type: MessageType.HIGHLIGHTER_MODE_STATUS }, statusContext)
  ).toBe(true);
  expect(statusContext.sendResponse).toHaveBeenCalledWith({ success: true, enabled: true });

  const disableContext = createContext();
  disableContext.highlighterModeState.set(7, true);
  expect(
    routeHighlighterMessage({ type: MessageType.DISABLE_HIGHLIGHTER_MODE }, disableContext)
  ).toBe(true);
  expect(disableContext.highlighterModeState.has(7)).toBe(false);
});

it('routes quick-edit mode transitions and returns false for unsupported editing messages', () => {
  const enableContext = createContext();
  expect(routeQuickEditMessage({ type: MessageType.ENABLE_QUICK_EDIT_MODE }, enableContext)).toBe(
    true
  );
  expect(enableContext.quickEditModeState.get(7)).toBe(true);
  expect(enableContext.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const statusContext = createContext();
  statusContext.quickEditModeState.set(7, true);
  expect(routeQuickEditMessage({ type: MessageType.QUICK_EDIT_MODE_STATUS }, statusContext)).toBe(
    true
  );
  expect(statusContext.sendResponse).toHaveBeenCalledWith({ success: true, enabled: true });

  const disableContext = createContext();
  disableContext.quickEditModeState.set(7, true);
  expect(routeQuickEditMessage({ type: MessageType.DISABLE_QUICK_EDIT_MODE }, disableContext)).toBe(
    true
  );
  expect(disableContext.quickEditModeState.has(7)).toBe(false);

  expect(
    routeHighlighterMessage({ type: MessageType.ENABLE_SCREENSHOT_MODE }, createContext())
  ).toBe(false);
  expect(
    routeQuickEditMessage({ type: MessageType.ENABLE_HIGHLIGHTER_MODE }, createContext())
  ).toBe(false);
});
