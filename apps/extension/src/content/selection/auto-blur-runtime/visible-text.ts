import { getAbsolutePosition } from '../../platform/frame';
import { normalizeAutoBlurRect } from './geometry';
import type { AutoBlurTextSource } from './types';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);
const EXTENSION_ROOT_SELECTOR =
  '#sniptale-extension-root, [data-ui^="content."], [data-ui^="ai-modal."]';

function isVisibleElement(element: HTMLElement): boolean {
  if (element.closest(EXTENSION_ROOT_SELECTOR)) {
    return false;
  }

  if (SKIPPED_TAGS.has(element.tagName)) {
    return false;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const opacity = style?.opacity === '' ? 1 : Number(style?.opacity);
  return Boolean(
    style && style.display !== 'none' && style.visibility !== 'hidden' && opacity !== 0
  );
}

function getRangeRects(textNode: Text, rootOffset: { x: number; y: number }) {
  const range = textNode.ownerDocument.createRange();
  range.selectNodeContents(textNode);

  const rects = getRectsFromRange(range, rootOffset);

  range.detach();
  return rects;
}

function getRectsFromRange(range: Range, rootOffset: { x: number; y: number }) {
  return Array.from(range.getClientRects())
    .map((rect) =>
      normalizeAutoBlurRect({
        x: rect.x + rootOffset.x,
        y: rect.y + rootOffset.y,
        width: rect.width,
        height: rect.height,
      })
    )
    .filter((rect): rect is NonNullable<typeof rect> => rect !== null);
}

export function getAutoBlurTextSourceRangeRects(
  source: AutoBlurTextSource,
  start: number,
  end: number
) {
  const textLength = source.textNode.textContent?.length ?? source.text.length;
  if (start < 0 || end <= start || end > textLength) {
    return source.rects;
  }

  const range = source.textNode.ownerDocument.createRange();
  range.setStart(source.textNode, start);
  range.setEnd(source.textNode, end);
  const rects = getRectsFromRange(range, source.rootOffset);
  range.detach();
  return rects.length > 0 ? rects : source.rects;
}

function collectVisibleTextFromDocument(
  doc: Document,
  sources: AutoBlurTextSource[],
  rootOffset: { x: number; y: number }
) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const text = node.textContent?.trim() ?? '';

      if (!parent || text.length === 0 || !isVisibleElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const element = textNode.parentElement;
    const rects = getRangeRects(textNode, rootOffset);

    if (element && rects.length > 0) {
      sources.push({
        element,
        rects,
        rootOffset,
        text: textNode.textContent ?? '',
        textNode,
      });
    }

    currentNode = walker.nextNode();
  }
}

function collectSameOriginIframeText(sources: AutoBlurTextSource[]) {
  document.querySelectorAll('iframe').forEach((iframe) => {
    try {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument?.body) {
        return;
      }

      const iframePosition = getAbsolutePosition(iframe);
      collectVisibleTextFromDocument(frameDocument, sources, {
        x: iframePosition.x,
        y: iframePosition.y,
      });
    } catch {
      // Cross-origin iframe content is intentionally unavailable to the content script.
    }
  });
}

export function collectVisibleAutoBlurTextSources(): AutoBlurTextSource[] {
  const sources: AutoBlurTextSource[] = [];

  if (document.body) {
    collectVisibleTextFromDocument(document, sources, { x: 0, y: 0 });
  }
  collectSameOriginIframeText(sources);

  return sources;
}
