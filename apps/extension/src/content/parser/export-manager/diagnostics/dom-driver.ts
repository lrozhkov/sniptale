import { createLogger } from '@sniptale/platform/observability/logger';
import {
  closeModal,
  delay,
  EXPORT_SELECTORS,
  isValidDownloadUrl,
  waitForElement,
} from '../files/utils';
import { clickHostPageElement } from '../../host-page-click';

const logger = createLogger({ namespace: 'ContentExportManager' });

function resolveAmbientWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function resolveElementWindow(element: Element): Window | undefined {
  return element.ownerDocument.defaultView ?? resolveAmbientWindow();
}

function isSafePreviewTriggerElement(element: HTMLElement): boolean {
  const elementView = resolveElementWindow(element) as (Window & typeof globalThis) | undefined;
  if (!elementView) {
    return false;
  }

  if (
    element instanceof elementView.HTMLImageElement ||
    element instanceof elementView.HTMLButtonElement
  ) {
    return true;
  }

  if (element instanceof elementView.HTMLAnchorElement) {
    return element.hasAttribute('download');
  }

  return element.getAttribute('role') === 'button' && !element.closest('a[href]');
}

export function listDirectDownloadLinks(documentRoot: Document = document): HTMLAnchorElement[] {
  return Array.from(
    documentRoot.querySelectorAll<HTMLAnchorElement>(EXPORT_SELECTORS.cellDownload)
  );
}

export function listPreviewTriggers(documentRoot: Document = document): HTMLElement[] {
  return Array.from(documentRoot.querySelectorAll<HTMLElement>(EXPORT_SELECTORS.previewTrigger));
}

export function listComputedStyleRootTargets(documentRoot: Document = document): Element[] {
  return [documentRoot.documentElement, documentRoot.body];
}

export function getCurrentExportPageUrl(pageUrl?: string): string {
  return pageUrl ?? resolveAmbientWindow()?.location.href ?? '';
}

export function queryComputedStyleTargets(
  selector: string,
  documentRoot: Document = document
): Element[] {
  return Array.from(documentRoot.querySelectorAll(selector));
}

export async function resolvePreviewDownloadHref(
  element: HTMLElement,
  pageUrl?: string
): Promise<string | null> {
  if (!isSafePreviewTriggerElement(element)) {
    logger.warn('Skipped unsafe preview trigger', element);
    return null;
  }

  const clickResult = clickHostPageElement(element);
  if (!clickResult.clicked) {
    logger.warn('Skipped preview trigger blocked by host-page click guard', {
      element,
      reason: clickResult.reason,
    });
    return null;
  }

  // The host page opens its preview modal only through its DOM click handler.
  const targetDocument = element.ownerDocument;
  const modal = await waitForElement(EXPORT_SELECTORS.modal, 2000, targetDocument);
  if (!modal) {
    logger.warn('Modal did not appear for preview', element);
    return null;
  }

  await delay(300);
  const downloadLink = modal.querySelector<HTMLAnchorElement>(EXPORT_SELECTORS.modalDownload);
  const validationUrl =
    pageUrl ??
    element.ownerDocument.defaultView?.location.href ??
    resolveAmbientWindow()?.location.href;
  if (!validationUrl) {
    return null;
  }

  if (!downloadLink || !isValidDownloadUrl(downloadLink.href, validationUrl)) {
    return null;
  }

  return downloadLink.href;
}

export async function dismissPreviewModal(targetDocument: Document = document): Promise<void> {
  await closeModal(targetDocument);
  await delay(200);
}
