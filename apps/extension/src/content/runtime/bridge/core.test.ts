import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleCoreModeMessage } from './core';
import type { ContentRuntimeMessage } from './types';

const {
  disableHighlighterMode,
  enableHighlighterMode,
  disableNavigationLock,
  enableNavigationLock,
  setFullLockMode,
  disableQuickEditMode,
  enableQuickEditMode,
} = vi.hoisted(() => ({
  disableHighlighterMode: vi.fn(),
  enableHighlighterMode: vi.fn(),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  setFullLockMode: vi.fn(),
  disableQuickEditMode: vi.fn(),
  enableQuickEditMode: vi.fn(),
}));

vi.mock('../../selection/highlighter', () => ({
  disableHighlighterMode,
  enableHighlighterMode,
}));

vi.mock('../../selection/locker', () => ({
  disableNavigationLock,
  enableNavigationLock,
  setFullLockMode,
}));

vi.mock('../../selection/quick-edit', () => ({
  disableQuickEditMode,
  enableQuickEditMode,
}));

function createMessage<T extends ContentRuntimeMessage['type']>(type: T) {
  return { type } as Extract<ContentRuntimeMessage, { type: T }>;
}

describe('handleCoreModeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps screenshot-mode activation out of top-level navigation lock ownership', () => {
    expect(handleCoreModeMessage(createMessage(MessageType.ENABLE_SCREENSHOT_MODE))).toBe(false);
    expect(enableNavigationLock).not.toHaveBeenCalled();
    expect(disableNavigationLock).not.toHaveBeenCalled();

    expect(handleCoreModeMessage(createMessage(MessageType.DISABLE_SCREENSHOT_MODE))).toBe(false);
    expect(disableNavigationLock).toHaveBeenCalledOnce();
  });

  it('routes highlighter and quick-edit mode toggles through their owner modules', () => {
    expect(handleCoreModeMessage(createMessage(MessageType.ENABLE_HIGHLIGHTER_MODE))).toBe(false);
    expect(enableHighlighterMode).toHaveBeenCalledOnce();
    expect(setFullLockMode).toHaveBeenCalledWith(true);

    expect(handleCoreModeMessage(createMessage(MessageType.DISABLE_HIGHLIGHTER_MODE))).toBe(false);
    expect(disableHighlighterMode).toHaveBeenCalledOnce();

    expect(handleCoreModeMessage(createMessage(MessageType.ENABLE_QUICK_EDIT_MODE))).toBe(false);
    expect(enableQuickEditMode).toHaveBeenCalledOnce();
    expect(setFullLockMode).toHaveBeenCalledTimes(2);

    expect(handleCoreModeMessage(createMessage(MessageType.DISABLE_QUICK_EDIT_MODE))).toBe(false);
    expect(disableQuickEditMode).toHaveBeenCalledOnce();
  });

  it('returns null for non-core runtime messages', () => {
    expect(handleCoreModeMessage(createMessage(MessageType.SHOW_TOOLBAR))).toBeNull();
  });
});
