export const CONTEXT_MENU_PAGE_LINK_ID = 'sniptale.page-link';
export const CONTEXT_MENU_PAGE_LINK_RICH_ID = 'sniptale.page-link.rich';
export const CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID = 'sniptale.page-link.markdown';
export const CONTEXT_MENU_PAGE_LINK_PLAIN_ID = 'sniptale.page-link.plain';

export const PageLinkCopyFormat = {
  RICH: 'rich',
  MARKDOWN: 'markdown',
  PLAIN: 'plain',
} as const;

export type PageLinkCopyFormat = (typeof PageLinkCopyFormat)[keyof typeof PageLinkCopyFormat];

export function parsePageLinkCopyFormat(menuId: string): PageLinkCopyFormat | null {
  switch (menuId) {
    case CONTEXT_MENU_PAGE_LINK_RICH_ID:
      return PageLinkCopyFormat.RICH;
    case CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID:
      return PageLinkCopyFormat.MARKDOWN;
    case CONTEXT_MENU_PAGE_LINK_PLAIN_ID:
      return PageLinkCopyFormat.PLAIN;
    default:
      return null;
  }
}

export function isPageLinkContextMenuItem(menuId: string): boolean {
  return parsePageLinkCopyFormat(menuId) !== null;
}
