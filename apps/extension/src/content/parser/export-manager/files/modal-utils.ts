import {
  closeFilePreviewPopup,
  FILE_PREVIEW_POPUP_SELECTORS,
  waitForVisibleElement,
} from '../../popup-export/dom-driver';
export { delay } from '../../popup-export/dom-driver';

export const EXPORT_SELECTORS = {
  tableRow: 'tr.tableRow',
  attrList: 'table.attrList',
  cellTableWidget: 'table.cellTableWidget',
  directDownload: 'a[href*="download"], a[href^="./download"]',
  iconElements: '[class*="Icon"], .fontIcon, .catItemIconAsThumbnail',
  cellText: '.stringView, .fileSizeView, .link',
  previewTrigger: [
    'img[style*="cursor: pointer"]',
    'img[fr-original-class="fr-draggable"]',
    '.catItemImgView img:not(.catItemIcon):not(.catItemIconAsThumbnail)',
  ].join(', '),
  modal: FILE_PREVIEW_POPUP_SELECTORS.modal,
  modalClose: FILE_PREVIEW_POPUP_SELECTORS.modalClose,
  modalDownload: FILE_PREVIEW_POPUP_SELECTORS.modalDownload,
  cellDownload: 'a[download], a[href*="download"]',
} as const;

export async function waitForElement(
  selector: string,
  timeout = 2000,
  targetDocument: Document = document
): Promise<HTMLElement | null> {
  return waitForVisibleElement(selector, timeout, targetDocument);
}

export async function closeModal(targetDocument: Document = document): Promise<void> {
  await closeFilePreviewPopup(targetDocument);
}
