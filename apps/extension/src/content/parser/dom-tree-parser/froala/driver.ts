import { resolveFilePreviewUrlFromTrigger } from '../../popup-export/preview-url';

const FROALA_IFRAME_SELECTOR = 'iframe';

/**
 * Lists live Froala iframes that may contain rich-text payloads.
 */
export function listFroalaIframes(targetDocument: Document = document): HTMLIFrameElement[] {
  return Array.from(targetDocument.querySelectorAll(FROALA_IFRAME_SELECTOR)).filter((iframe) => {
    const iframeEl = iframe as HTMLIFrameElement;
    const src = iframeEl.src || '';
    const id = iframeEl.id || '';

    return (
      iframeEl.getAttribute('data-application-code') !== 'dynamicFields' &&
      (src.includes('richText') || id.includes('iframe$'))
    );
  }) as HTMLIFrameElement[];
}

/**
 * Resolves the inspectable body for a Froala iframe when it is same-origin or local.
 */
function resolveDocumentBaseUrl(documentRoot: Document): string {
  return (
    documentRoot.defaultView?.location.href ?? documentRoot.location?.href ?? documentRoot.baseURI
  );
}

export function resolveFroalaIframeBody(
  iframe: HTMLIFrameElement,
  baseUrl?: string
): HTMLElement | null {
  const iframeSrc = iframe.src || '';
  const resolvedBaseUrl = baseUrl ?? resolveDocumentBaseUrl(iframe.ownerDocument);
  const iframeOrigin = new URL(iframeSrc, resolvedBaseUrl).origin;
  const pageOrigin = new URL(resolvedBaseUrl, resolvedBaseUrl).origin;

  if (
    iframeOrigin !== pageOrigin &&
    !iframeSrc.startsWith('about:') &&
    !iframeSrc.startsWith('richText')
  ) {
    return null;
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  return iframeDoc?.body ?? null;
}

/**
 * Requests a preview download URL by interacting with the Froala popup boundary seam.
 */
export async function resolveFroalaPopupUrlFromImage(args: {
  imgElement: HTMLImageElement;
  fallbackUrl: string | null;
  timeoutMs?: number;
  targetDocument?: Document;
  onClickError?: (error: unknown) => void;
}): Promise<string | null> {
  const {
    imgElement,
    fallbackUrl,
    timeoutMs = 3000,
    targetDocument = document,
    onClickError,
  } = args;

  return resolveFilePreviewUrlFromTrigger({
    trigger: imgElement,
    fallbackUrl,
    timeoutMs,
    targetDocument,
    ...(onClickError === undefined ? {} : { onTriggerError: onClickError }),
  });
}
