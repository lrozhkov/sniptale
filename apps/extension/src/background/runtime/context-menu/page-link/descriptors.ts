import { translate } from '../../../../platform/i18n';
import type { ContextMenuDescriptor } from '../types';
import { CONTEXT_MENU_ROOT_ID } from '../constants';
import {
  CONTEXT_MENU_PAGE_LINK_ID,
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './constants';

function createPageLinkDescriptor(
  id: string,
  title: string,
  parentId: string
): ContextMenuDescriptor {
  return { id, parentId, title };
}

export function buildPageLinkCopyDescriptors(): ContextMenuDescriptor[] {
  return [
    createPageLinkDescriptor(
      CONTEXT_MENU_PAGE_LINK_ID,
      translate('popup.common.pageLinkCopyTitle'),
      CONTEXT_MENU_ROOT_ID
    ),
    createPageLinkDescriptor(
      CONTEXT_MENU_PAGE_LINK_RICH_ID,
      translate('popup.common.pageLinkCopyRichLabel'),
      CONTEXT_MENU_PAGE_LINK_ID
    ),
    createPageLinkDescriptor(
      CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
      translate('popup.common.pageLinkCopyMarkdownLabel'),
      CONTEXT_MENU_PAGE_LINK_ID
    ),
    createPageLinkDescriptor(
      CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
      translate('popup.common.pageLinkCopyPlainLabel'),
      CONTEXT_MENU_PAGE_LINK_ID
    ),
  ];
}
