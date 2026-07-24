import { getIframeDocument } from './core';
import { getIframeSelector } from './selectors/iframe';

export interface DocumentPagePlacement {
  iframePath: string[];
  pageX: number;
  pageY: number;
}

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

function getDocumentFrameChain(ownerDocument: Document): HTMLIFrameElement[] | null {
  const chain: HTMLIFrameElement[] = [];
  let currentDocument = ownerDocument;
  let depth = 0;

  while (currentDocument !== document && depth < 10) {
    depth += 1;
    const iframe = currentDocument.defaultView?.frameElement as HTMLIFrameElement | null;
    if (!iframe) return null;
    chain.unshift(iframe);
    currentDocument = iframe.ownerDocument;
  }

  return currentDocument === document ? chain : null;
}

function getIframeViewportOffset(iframe: HTMLIFrameElement): Point {
  const rect = iframe.getBoundingClientRect();
  return { x: rect.left + iframe.clientLeft, y: rect.top + iframe.clientTop };
}

function translateLocalClientPointToTop(point: Point, chain: HTMLIFrameElement[]): Point {
  let x = point.x;
  let y = point.y;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const iframe = chain[index];
    if (!iframe) continue;
    const offset = getIframeViewportOffset(iframe);
    x += offset.x;
    y += offset.y;
  }
  return { x, y };
}

function translateTopPointToLocalClient(point: Point, chain: HTMLIFrameElement[]): Point {
  let x = point.x;
  let y = point.y;
  for (const iframe of chain) {
    const offset = getIframeViewportOffset(iframe);
    x -= offset.x;
    y -= offset.y;
  }
  return { x, y };
}

function resolvePlacementContext(iframePath: string[]): {
  chain: HTMLIFrameElement[];
  ownerDocument: Document;
} | null {
  const chain: HTMLIFrameElement[] = [];
  let ownerDocument = document;

  for (const selector of iframePath) {
    let iframe: HTMLIFrameElement | null;
    try {
      iframe = ownerDocument.querySelector(selector) as HTMLIFrameElement | null;
    } catch {
      return null;
    }
    if (!iframe) return null;
    const iframeDocument = getIframeDocument(iframe);
    if (!iframeDocument) return null;
    chain.push(iframe);
    ownerDocument = iframeDocument;
  }

  return { chain, ownerDocument };
}

function getDocumentScroll(ownerDocument: Document): Point {
  return {
    x: ownerDocument.defaultView?.scrollX ?? 0,
    y: ownerDocument.defaultView?.scrollY ?? 0,
  };
}

export function getTopViewportPoint(
  ownerDocument: Document,
  clientX: number,
  clientY: number
): Point | null {
  const chain = getDocumentFrameChain(ownerDocument);
  return chain ? translateLocalClientPointToTop({ x: clientX, y: clientY }, chain) : null;
}

export function getDocumentViewportBounds(ownerDocument: Document): Rect | null {
  const ownerWindow = ownerDocument.defaultView;
  const chain = getDocumentFrameChain(ownerDocument);
  if (!ownerWindow || !chain) return null;
  const topLeft = translateLocalClientPointToTop({ x: 0, y: 0 }, chain);
  const bottomRight = translateLocalClientPointToTop(
    { x: ownerWindow.innerWidth, y: ownerWindow.innerHeight },
    chain
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(0, bottomRight.x - topLeft.x),
    height: Math.max(0, bottomRight.y - topLeft.y),
  };
}

export function createDocumentPagePlacement(
  ownerDocument: Document,
  topViewportX: number,
  topViewportY: number
): DocumentPagePlacement | null {
  const chain = getDocumentFrameChain(ownerDocument);
  if (!chain) return null;
  const localPoint = translateTopPointToLocalClient({ x: topViewportX, y: topViewportY }, chain);
  const scroll = getDocumentScroll(ownerDocument);
  return {
    iframePath: chain.map((iframe) => getIframeSelector(iframe, iframe.ownerDocument)),
    pageX: localPoint.x + scroll.x,
    pageY: localPoint.y + scroll.y,
  };
}

export function resolveDocumentPagePlacement(placement: DocumentPagePlacement): Point | null {
  const context = resolvePlacementContext(placement.iframePath);
  if (!context) return null;
  const scroll = getDocumentScroll(context.ownerDocument);
  return translateLocalClientPointToTop(
    { x: placement.pageX - scroll.x, y: placement.pageY - scroll.y },
    context.chain
  );
}

export function updateDocumentPagePlacement(
  placement: DocumentPagePlacement,
  topViewportX: number,
  topViewportY: number,
  previousTopViewportPoint?: Point
): DocumentPagePlacement | null {
  const context = resolvePlacementContext(placement.iframePath);
  if (!context) {
    if (!previousTopViewportPoint) return null;
    return {
      iframePath: [...placement.iframePath],
      pageX: placement.pageX + topViewportX - previousTopViewportPoint.x,
      pageY: placement.pageY + topViewportY - previousTopViewportPoint.y,
    };
  }
  const localPoint = translateTopPointToLocalClient(
    { x: topViewportX, y: topViewportY },
    context.chain
  );
  const scroll = getDocumentScroll(context.ownerDocument);
  return {
    iframePath: [...placement.iframePath],
    pageX: localPoint.x + scroll.x,
    pageY: localPoint.y + scroll.y,
  };
}
