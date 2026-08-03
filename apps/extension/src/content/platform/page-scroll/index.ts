const SCROLL_EPSILON_CSS_PX = 2;

export type PageScrollRoot =
  | { element: HTMLElement; kind: 'element' }
  | { element: HTMLElement; kind: 'document' }
  | { element: null; kind: 'viewport' };

export interface PageScrollGeometry {
  extentHeight: number;
  extentWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}

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
  return visibleArea / Math.max(1, window.innerWidth * window.innerHeight);
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
  if (!winner) return null;
  const runnerUp = candidates[1];
  if (runnerUp && winner.score < runnerUp.score * 2) {
    throw new Error('unsupported-layout: multiple independent scroll containers');
  }
  return winner.element;
}

export function resolvePageScrollRoot(): PageScrollRoot {
  const documentScroller = document.scrollingElement;
  if (documentScroller instanceof HTMLElement && hasScrollableExtent(documentScroller)) {
    return { element: documentScroller, kind: 'document' };
  }
  const internal = resolveDominantInternalScroller();
  return internal ? { element: internal, kind: 'element' } : { element: null, kind: 'viewport' };
}

export function measurePageScrollGeometry(root: PageScrollRoot): PageScrollGeometry {
  const windowWidth = Math.max(1, window.innerWidth);
  const windowHeight = Math.max(1, window.innerHeight);
  if (root.kind === 'viewport') {
    return {
      extentHeight: windowHeight,
      extentWidth: windowWidth,
      viewportHeight: windowHeight,
      viewportWidth: windowWidth,
    };
  }
  if (root.kind === 'document') {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      extentHeight: Math.max(
        documentElement.scrollHeight,
        documentElement.offsetHeight,
        body?.scrollHeight ?? 0
      ),
      extentWidth: Math.max(
        documentElement.scrollWidth,
        documentElement.offsetWidth,
        body?.scrollWidth ?? 0
      ),
      viewportHeight: windowHeight,
      viewportWidth: windowWidth,
    };
  }
  return {
    extentHeight: root.element.scrollHeight,
    extentWidth: root.element.scrollWidth,
    viewportHeight: Math.max(1, root.element.clientHeight),
    viewportWidth: Math.max(1, root.element.clientWidth),
  };
}

export function readPageScroll(root: PageScrollRoot): { x: number; y: number } {
  if (root.kind === 'viewport') return { x: 0, y: 0 };
  if (root.kind === 'document') return { x: window.scrollX, y: window.scrollY };
  return { x: root.element.scrollLeft, y: root.element.scrollTop };
}

export function writePageScroll(root: PageScrollRoot, x: number, y: number): void {
  if (root.kind === 'viewport') return;
  if (root.kind === 'document') {
    window.scrollTo({ behavior: 'instant', left: x, top: y });
    return;
  }
  root.element.scrollTo({ behavior: 'instant', left: x, top: y });
}
