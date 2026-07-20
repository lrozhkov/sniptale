import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { showContextMenuToast } from '../action-helpers';
import { formatPageLinkClipboardPayload } from './format';
import { resolvePageLinkTitle } from './metadata';
import { type PageLinkCopyFormat } from './constants';

function resolvePageLinkUrl(tab: chrome.tabs.Tab, pageUrl?: string): string {
  const url = tab.url?.trim() || pageUrl?.trim();

  if (!url) {
    throw new Error(translate('popup.common.noActiveTab'));
  }

  return url;
}

export async function copyContextMenuPageLink(args: {
  format: PageLinkCopyFormat;
  pageUrl?: string;
  tab: chrome.tabs.Tab;
  tabId: number;
}): Promise<void> {
  const title = await resolvePageLinkTitle(args.tab);
  const payload = formatPageLinkClipboardPayload(
    {
      title,
      url: resolvePageLinkUrl(args.tab, args.pageUrl),
    },
    args.format
  );
  const copyResponse = await getBackgroundRuntimeMessaging().sendTabMessage(args.tabId, {
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    ...payload,
  });

  if (!copyResponse?.success) {
    throw new Error(copyResponse?.error || translate('content.runtime.copyTextFailed'));
  }

  await showContextMenuToast(args.tabId, {
    message: translate('popup.export.copied'),
    title: translate('popup.common.pageLinkCopyTitle'),
    type: 'success',
  });
}
