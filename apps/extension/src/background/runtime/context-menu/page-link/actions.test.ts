import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { PageLinkCopyFormat } from './constants';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const { sendTabMessageMock, showContextMenuToastMock, resolvePageLinkTitleMock } = vi.hoisted(
  () => ({
    resolvePageLinkTitleMock: vi.fn(),
    sendTabMessageMock: vi.fn(),
    showContextMenuToastMock: vi.fn(),
  })
);

vi.mock('../../../../platform/runtime-messaging', async () => {
  const actual = await vi.importActual('../../../../platform/runtime-messaging');
  return {
    ...actual,
    sendTabMessage: sendTabMessageMock,
  };
});

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../action-helpers', async () => {
  const actual = await vi.importActual('../action-helpers');
  return {
    ...actual,
    showContextMenuToast: showContextMenuToastMock,
  };
});

vi.mock('./metadata', () => ({
  resolvePageLinkTitle: resolvePageLinkTitleMock,
}));

import { copyContextMenuPageLink } from './actions';

function createTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 21,
    title: 'Tab title',
    url: 'https://example.test/page',
    ...overrides,
  } as chrome.tabs.Tab;
}

function resetPageLinkActionMocks(): void {
  vi.clearAllMocks();
  resolvePageLinkTitleMock.mockResolvedValue('Page title');
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
}

beforeEach(resetPageLinkActionMocks);

describe('context menu page-link copy actions', () => {
  it('copies the plain page-link format and shows success feedback', async () => {
    await copyContextMenuPageLink({
      format: PageLinkCopyFormat.PLAIN,
      tab: createTab(),
      tabId: 21,
    });

    expect(sendTabMessageMock).toHaveBeenCalledWith(21, {
      text: 'Page title\nhttps://example.test/page',
      type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    });
    expect(showContextMenuToastMock).toHaveBeenCalledWith(
      21,
      expect.objectContaining({ type: 'success' })
    );
  });

  it('uses pageUrl when the tab URL is empty', async () => {
    await copyContextMenuPageLink({
      format: PageLinkCopyFormat.MARKDOWN,
      pageUrl: 'https://fallback.example/page',
      tab: createTab({ url: '' }),
      tabId: 21,
    });

    expect(sendTabMessageMock).toHaveBeenCalledWith(
      21,
      expect.objectContaining({
        text: '[Page title](https://fallback.example/page)',
      })
    );
  });
});

describe('context menu page-link copy failures', () => {
  it('surfaces copy failures and rejects missing URLs before clipboard writes', async () => {
    sendTabMessageMock.mockResolvedValueOnce({ error: '', success: false });

    await expect(
      copyContextMenuPageLink({
        format: PageLinkCopyFormat.PLAIN,
        tab: createTab(),
        tabId: 21,
      })
    ).rejects.toThrow('content.runtime.copyTextFailed');

    await expect(
      copyContextMenuPageLink({
        format: PageLinkCopyFormat.PLAIN,
        tab: createTab({ url: '' }),
        tabId: 21,
      })
    ).rejects.toThrow('popup.common.noActiveTab');
  });
});
