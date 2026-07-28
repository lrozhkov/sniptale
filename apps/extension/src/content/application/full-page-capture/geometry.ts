import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import type { ScrollCaptureRoot } from './types';

const SCROLL_EPSILON_CSS_PX = 2;

type ScrollerCandidate = {
  element: HTMLElement;
  score: number;
};

function hasScrollableExtent(element: HTMLElement): boolean {
  return (
    element.scrollWidth - element.clientWidth > SCROLL_EPSILON_CSS_PX ||
    element.scrollHeight - element.clientHeight > SCROLL_EPSILON_CSS_PX
  );
}

function getVisibleAreaRatio(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  return visibleArea / viewportArea;
}

function toScrollerCandidate(element: HTMLElement): ScrollerCandidate | null {
  if (!hasScrollableExtent(element) || element.clientWidth <= 0 || element.clientHeight <= 0) {
    return null;
  }
  const style = getComputedStyle(element);
  const allowed = new Set(['auto', 'scroll', 'overlay']);
  const scrollableX = allowed.has(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
  const scrollableY =
    allowed.has(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
  if (!scrollableX && !scrollableY) {
    return null;
  }
  const visibleAreaRatio = getVisibleAreaRatio(element);
  if (visibleAreaRatio < 0.5) {
    return null;
  }
  return {
    element,
    score:
      visibleAreaRatio *
      (1 +
        (element.scrollWidth - element.clientWidth) / element.clientWidth +
        (element.scrollHeight - element.clientHeight) / element.clientHeight),
  };
}

function resolveDominantInternalScroller(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('*'))
    .map(toScrollerCandidate)
    .filter((candidate): candidate is ScrollerCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score);
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  const runnerUp = candidates[1];
  if (runnerUp && winner.score < runnerUp.score * 2) {
    throw new Error('unsupported-layout: multiple independent scroll containers');
  }
  return winner.element;
}

export function resolveScrollCaptureRoot(): ScrollCaptureRoot {
  const documentScroller = document.scrollingElement;
  if (documentScroller instanceof HTMLElement && hasScrollableExtent(documentScroller)) {
    return { element: documentScroller, kind: 'document' };
  }
  const internal = resolveDominantInternalScroller();
  return internal ? { element: internal, kind: 'element' } : { element: null, kind: 'viewport' };
}

function getDocumentExtent(): { height: number; width: number } {
  const body = document.body;
  const root = document.documentElement;
  return {
    height: Math.max(root.scrollHeight, root.offsetHeight, body?.scrollHeight ?? 0),
    width: Math.max(root.scrollWidth, root.offsetWidth, body?.scrollWidth ?? 0),
  };
}

export function measureCaptureGeometry(root: ScrollCaptureRoot): FullPageCaptureGeometry {
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const devicePixelRatio = Math.max(0.01, window.devicePixelRatio || 1);
  if (root.kind === 'viewport') {
    return {
      devicePixelRatio,
      extentHeight: viewportHeight,
      extentWidth: viewportWidth,
      outputHeight: viewportHeight,
      outputWidth: viewportWidth,
      rootKind: root.kind,
      rootViewport: { height: viewportHeight, width: viewportWidth, x: 0, y: 0 },
      viewportHeight,
      viewportWidth,
    };
  }
  if (root.kind === 'document') {
    const extent = getDocumentExtent();
    return {
      devicePixelRatio,
      extentHeight: extent.height,
      extentWidth: extent.width,
      outputHeight: extent.height,
      outputWidth: extent.width,
      rootKind: root.kind,
      rootViewport: { height: viewportHeight, width: viewportWidth, x: 0, y: 0 },
      viewportHeight,
      viewportWidth,
    };
  }
  const rect = root.element.getBoundingClientRect();
  const x = Math.max(0, rect.left + root.element.clientLeft);
  const y = Math.max(0, rect.top + root.element.clientTop);
  const width = Math.max(1, Math.min(root.element.clientWidth, viewportWidth - x));
  const height = Math.max(1, Math.min(root.element.clientHeight, viewportHeight - y));
  return {
    devicePixelRatio,
    extentHeight: root.element.scrollHeight,
    extentWidth: root.element.scrollWidth,
    outputHeight: y + root.element.scrollHeight + Math.max(0, viewportHeight - (y + height)),
    outputWidth: x + root.element.scrollWidth + Math.max(0, viewportWidth - (x + width)),
    rootKind: root.kind,
    rootViewport: { height, width, x, y },
    viewportHeight,
    viewportWidth,
  };
}

export function readRootScroll(root: ScrollCaptureRoot): { x: number; y: number } {
  if (root.kind === 'viewport') return { x: 0, y: 0 };
  if (root.kind === 'document') return { x: window.scrollX, y: window.scrollY };
  return { x: root.element.scrollLeft, y: root.element.scrollTop };
}

export function writeRootScroll(root: ScrollCaptureRoot, x: number, y: number): void {
  if (root.kind === 'viewport') return;
  if (root.kind === 'document') {
    window.scrollTo({ behavior: 'instant', left: x, top: y });
    return;
  }
  root.element.scrollTo({ behavior: 'instant', left: x, top: y });
}

export function createLayoutGeneration(geometry: FullPageCaptureGeometry): string {
  return [
    geometry.rootKind,
    geometry.devicePixelRatio,
    geometry.viewportWidth,
    geometry.viewportHeight,
    geometry.extentWidth,
    geometry.extentHeight,
    geometry.rootViewport.x,
    geometry.rootViewport.y,
    geometry.rootViewport.width,
    geometry.rootViewport.height,
  ].join(':');
}
