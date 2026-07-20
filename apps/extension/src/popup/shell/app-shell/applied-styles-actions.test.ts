// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getCurrentPageAppliedStyleCount, openAppliedPageStyles } from './applied-styles-actions';
import { installPopupRuntimeMessagingMock } from '../runtime/services.test-support';

const mocks = vi.hoisted(() => ({
  getActiveTabId: vi.fn(async () => 42),
  sendRuntimeMessage: vi.fn(),
  translate: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('../tab-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-access')>()),
  getActiveTabId: mocks.getActiveTabId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  installPopupRuntimeMessagingMock(mocks.sendRuntimeMessage);
  vi.stubGlobal('close', vi.fn());
});

describe('popup applied style actions', () => {
  it('queries the active tab for the current-page applied rule count', async () => {
    mocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      summary: { activeAppliedCount: 2, matchedRules: [], pageUrl: 'https://example.test' },
    });

    await expect(getCurrentPageAppliedStyleCount()).resolves.toBe(2);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
      tabId: 42,
    });
  });

  it('opens preparation mode, switches to page editing, then opens the inspector rules tab', async () => {
    mocks.sendRuntimeMessage.mockResolvedValue({ success: true });

    await openAppliedPageStyles();

    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      tabId: 42,
    });
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: MessageType.ENABLE_QUICK_EDIT_MODE,
      tabId: 42,
    });
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      type: MessageType.OPEN_PAGE_STYLE_INSPECTOR,
      tabId: 42,
      targetTab: PAGE_STYLE_INSPECTOR_TABS.RULES,
    });
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it('surfaces query and open failures without closing the popup', async () => {
    mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false });
    await expect(getCurrentPageAppliedStyleCount()).rejects.toThrow(
      't:popup.common.stalePageRuntimeHint'
    );

    mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false });
    await expect(openAppliedPageStyles()).rejects.toThrow('t:popup.home.openPrepError');
    expect(window.close).not.toHaveBeenCalled();
  });
});
