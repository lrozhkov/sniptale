import { clickHostPageElement } from '../host-page-click';
import { resolveKeyboardEventConstructor, scheduleDomDriverTimeout } from './dom-runtime';

export const FILE_PREVIEW_POPUP_SELECTORS = {
  modal: '#gwt-debug-filePreview, .popupContent, .gwt-PopupPanel',
  modalClose: '#gwt-debug-closeButton, .closeButton, [role="button"][aria-label*="закрыть"]',
  modalDownload: '#gwt-debug-downloadButton a, .downloadButton a, a[download]',
  previewImage: '#gwt-debug-imagePreview, .preview-image, img',
} as const;

interface FilePreviewPopupState {
  popup: HTMLElement;
  resolvedUrl: string | null;
}

function resolveDocumentView(targetDocument: Document): Window | null {
  return targetDocument.defaultView ?? null;
}

/** Delays DOM-driver orchestration without leaking timer details into callers. */
export function delay(ms: number, targetDocument?: Document): Promise<void> {
  return new Promise((resolve) => scheduleDomDriverTimeout(resolve, ms, targetDocument));
}

function isElementVisible(element: HTMLElement): boolean {
  const elementView = resolveDocumentView(element.ownerDocument);
  if (!elementView) {
    return false;
  }
  const style = elementView.getComputedStyle(element);
  return !(
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    (element.offsetWidth === 0 && element.offsetHeight === 0)
  );
}

/** Waits until a visible file-preview element appears in the current document. */
export async function waitForVisibleElement(
  selector: string,
  timeout = 2000,
  targetDocument: Document = document
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const candidates = Array.from(targetDocument.querySelectorAll<HTMLElement>(selector));
    const visibleElement = candidates.find((element) => isElementVisible(element)) ?? null;
    if (visibleElement) {
      return visibleElement;
    }

    await delay(100, targetDocument);
  }

  return null;
}

/** Resolves the visible file-preview popup and its best-known download URL. */
export function resolveVisibleFilePreviewPopup(
  targetDocument: Document = document
): FilePreviewPopupState | null {
  const popup =
    Array.from(
      targetDocument.querySelectorAll<HTMLElement>(FILE_PREVIEW_POPUP_SELECTORS.modal)
    ).find((candidate) => isElementVisible(candidate)) ?? null;
  if (!popup || !isElementVisible(popup)) {
    return null;
  }

  const downloadLink = popup.querySelector(
    FILE_PREVIEW_POPUP_SELECTORS.modalDownload
  ) as HTMLAnchorElement | null;
  const previewImg = popup.querySelector(
    FILE_PREVIEW_POPUP_SELECTORS.previewImage
  ) as HTMLImageElement | null;

  return {
    popup,
    resolvedUrl: downloadLink?.href || previewImg?.src || null,
  };
}

/** Closes the visible file-preview popup via close control or Escape fallback. */
export async function closeFilePreviewPopup(targetDocument: Document = document): Promise<void> {
  const popupState = resolveVisibleFilePreviewPopup(targetDocument);
  const closeButton =
    (popupState?.popup.querySelector(
      FILE_PREVIEW_POPUP_SELECTORS.modalClose
    ) as HTMLElement | null) ??
    (targetDocument.querySelector(FILE_PREVIEW_POPUP_SELECTORS.modalClose) as HTMLElement | null);
  if (closeButton && clickHostPageElement(closeButton).clicked) {
    await delay(200, targetDocument);
    return;
  }

  const KeyboardEventConstructor = resolveKeyboardEventConstructor(targetDocument);
  if (KeyboardEventConstructor) {
    targetDocument.dispatchEvent(
      new KeyboardEventConstructor('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
      })
    );
  }
  await delay(200, targetDocument);
}
