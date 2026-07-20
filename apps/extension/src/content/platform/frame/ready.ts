import { getAccessibleIframes, getIframeDocument, walkAllDocuments } from './core';
import { createLogger } from '@sniptale/platform/observability/logger';

export type AccessibleIframeReadyResult = {
  pendingIframes: HTMLIFrameElement[];
  timedOut: boolean;
  totalIframes: number;
};

type WaitForAccessibleIframeReadyParams = {
  contextLabel?: string;
  pollIntervalMs?: number;
  rootDocument?: Document;
  timeoutMs?: number;
};

const logger = createLogger({ namespace: 'FrameIframeDiag', traceEnabled: true });

const INTRINSIC_CONTENT_TAGS = new Set([
  'audio',
  'button',
  'canvas',
  'img',
  'input',
  'option',
  'select',
  'svg',
  'textarea',
  'video',
]);

function hasIntrinsicContentElement(body: HTMLElement): boolean {
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node): number {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      if (tagName === 'body') {
        return NodeFilter.FILTER_SKIP;
      }

      if (['head', 'link', 'meta', 'script', 'style'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (INTRINSIC_CONTENT_TAGS.has(tagName)) {
        return NodeFilter.FILTER_ACCEPT;
      }

      return element.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  return walker.nextNode() !== null;
}

function hasMeaningfulBodyContent(doc: Document): boolean {
  const body = doc.body;
  if (!body) {
    return false;
  }

  return hasIntrinsicContentElement(body) || Boolean(body.textContent?.trim());
}

function isIframeReady(iframe: HTMLIFrameElement): boolean {
  const iframeDoc = getIframeDocument(iframe);
  if (!iframeDoc || iframeDoc.readyState === 'loading') {
    return false;
  }

  return hasMeaningfulBodyContent(iframeDoc);
}

function collectAccessibleIframesRecursive(rootDoc: Document = document): HTMLIFrameElement[] {
  const accessibleIframes = new Set<HTMLIFrameElement>();

  walkAllDocuments((doc, iframe) => {
    if (iframe) {
      accessibleIframes.add(iframe);
    }

    getAccessibleIframes(doc).forEach((nestedIframe) => {
      accessibleIframes.add(nestedIframe);
    });
  }, rootDoc);

  return Array.from(accessibleIframes);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

/**
 * Waits briefly for accessible same-origin iframe documents to finish initial rendering before a
 * synchronous DOM snapshot runs. The wait is bounded and falls back to partial data on timeout.
 */
export async function waitForAccessibleIframeReady(
  params: WaitForAccessibleIframeReadyParams = {}
): Promise<AccessibleIframeReadyResult> {
  const timeoutMs = params.timeoutMs ?? 500;
  const pollIntervalMs = params.pollIntervalMs ?? 25;
  const rootDocument = params.rootDocument ?? document;
  const start = performance.now();

  while (true) {
    const accessibleIframes = collectAccessibleIframesRecursive(rootDocument);
    const pendingIframes = accessibleIframes.filter((iframe) => !isIframeReady(iframe));

    if (pendingIframes.length === 0) {
      return {
        pendingIframes,
        timedOut: false,
        totalIframes: accessibleIframes.length,
      };
    }

    if (performance.now() - start >= timeoutMs) {
      logger.debug('waitForAccessibleIframeReady.timeout', {
        contextLabel: params.contextLabel ?? 'unknown',
        pendingIframes: pendingIframes.map((iframe) => iframe.id || iframe.src || 'unknown'),
        totalIframes: accessibleIframes.length,
      });

      return {
        pendingIframes,
        timedOut: true,
        totalIframes: accessibleIframes.length,
      };
    }

    await sleep(pollIntervalMs);
  }
}
