import { getFrozenHitSamplingBoxes } from './frozen-hit-shapes';
import { isContentOwnedElement } from '../../platform/dom-host';
import { getAbsolutePosition, getIframeDocument } from '../../platform/frame';
import type { FrozenSelectionFrame, FrozenSelectionGeometry, Selection } from './types';

type HitRegion = Selection & { element: HTMLElement };

function contains(rect: Selection, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function isHtmlElement(element: Element): element is HTMLElement {
  return element.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

function isIframe(element: Element): element is HTMLIFrameElement {
  return isHtmlElement(element) && element.localName === 'iframe';
}

function collectElements(root: Document | ShadowRoot, depth = 0): HTMLElement[] {
  const result: HTMLElement[] = [];
  if (depth > 12) return result;
  for (const element of root.querySelectorAll('*')) {
    if (isContentOwnedElement(element)) continue;
    if (isHtmlElement(element)) result.push(element);
    if (element.shadowRoot) result.push(...collectElements(element.shadowRoot, depth + 1));
    const nestedDocument = isIframe(element) ? getIframeDocument(element) : null;
    if (nestedDocument) result.push(...collectElements(nestedDocument, depth + 1));
  }
  return result;
}

function targetAt(
  root: Document | ShadowRoot,
  x: number,
  y: number,
  depth = 0
): HTMLElement | null {
  if (depth > 12) return null;
  const element = root
    .elementsFromPoint(x, y)
    .find((candidate) => !isContentOwnedElement(candidate));
  if (!element) return null;
  if (isIframe(element)) {
    const nestedDocument = getIframeDocument(element);
    const rect = element.getBoundingClientRect();
    if (nestedDocument && rect.width > 0 && rect.height > 0) {
      const scaleX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
      const scaleY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
      return (
        targetAt(
          nestedDocument,
          (x - rect.left) / scaleX - element.clientLeft,
          (y - rect.top) / scaleY - element.clientTop,
          depth + 1
        ) ?? element
      );
    }
  }
  const nested = element.shadowRoot ? targetAt(element.shadowRoot, x, y, depth + 1) : null;
  if (nested) return nested;
  let htmlTarget: Element | null = element;
  while (htmlTarget && !isHtmlElement(htmlTarget)) htmlTarget = htmlTarget.parentElement;
  return htmlTarget as HTMLElement | null;
}

/** Captures browser hit order, resolving shaped areas at screenshot-pixel precision. */
export function captureFrozenSelectionGeometry(): FrozenSelectionGeometry {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = window.devicePixelRatio || 1;
  const viewportScale = window.visualViewport?.scale ?? 1;
  const rects = new Map<HTMLElement, Selection>();
  const fragments: Selection[] = [];
  for (const element of collectElements(document)) {
    const rect = getAbsolutePosition(element);
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x < width &&
      rect.y < height &&
      rect.x + rect.width > 0 &&
      rect.y + rect.height > 0
    ) {
      rects.set(element, rect);
      const clientRects = element.getClientRects();
      if (clientRects.length > 1) {
        const bounds = element.getBoundingClientRect();
        const scaleX = rect.width / bounds.width;
        const scaleY = rect.height / bounds.height;
        for (const fragment of Array.from(clientRects)) {
          fragments.push({
            x: rect.x + (fragment.x - bounds.x) * scaleX,
            y: rect.y + (fragment.y - bounds.y) * scaleY,
            width: fragment.width * scaleX,
            height: fragment.height * scaleY,
          });
        }
      }
    }
  }
  const shapedBoxes = [...rects].flatMap(([element, rect]) =>
    getFrozenHitSamplingBoxes(element, rect, scale)
  );
  const regions = captureHitRegions(rects, fragments, shapedBoxes, width, height, scale);
  return {
    width,
    height,
    scale,
    getRect: (element) => ({ ...(rects.get(element) ?? { x: 0, y: 0, width: 0, height: 0 }) }),
    targetAt: (x, y) => regions.find((region) => contains(region, x, y))?.element ?? null,
    assertViewport: () => {
      if (
        window.innerWidth !== width ||
        window.innerHeight !== height ||
        (window.devicePixelRatio || 1) !== scale ||
        (window.visualViewport?.scale ?? 1) !== viewportScale
      ) {
        throw new Error('Selection viewport changed');
      }
    },
  };
}

function pixelEdges(start: number, length: number, maximum: number, scale: number): number[] {
  const edges: number[] = [];
  const first = Math.ceil(Math.max(0, start) * scale);
  const last = Math.floor(Math.min(maximum, start + length) * scale);
  for (let pixel = first; pixel <= last; pixel += 1) edges.push(pixel / scale);
  return edges;
}

function captureHitRegions(
  rects: Map<HTMLElement, Selection>,
  fragments: Selection[],
  shapedBoxes: Selection[],
  width: number,
  height: number,
  scale: number
): HitRegion[] {
  const boxes = [...rects.values(), ...fragments];
  const edges = (values: number[], maximum: number) =>
    [
      ...new Set([0, maximum, ...values.map((value) => Math.max(0, Math.min(maximum, value)))]),
    ].sort((a, b) => a - b);
  const ys = edges(
    [
      ...boxes.flatMap((rect) => [rect.y, rect.y + rect.height]),
      ...shapedBoxes.flatMap((rect) => pixelEdges(rect.y, rect.height, height, scale)),
    ],
    height
  );
  const regions: HitRegion[] = [];
  let probes = 0;
  for (let row = 1; row < ys.length; row += 1) {
    const top = ys[row - 1]!;
    const bottom = ys[row]!;
    const y = (top + bottom) / 2;
    const rowBoxes = boxes.filter((rect) => y >= rect.y && y < rect.y + rect.height);
    const rowShapes = shapedBoxes.filter((rect) => y >= rect.y && y < rect.y + rect.height);
    const xs = edges(
      [
        ...rowBoxes.flatMap((rect) => [rect.x, rect.x + rect.width]),
        ...rowShapes.flatMap((rect) => pixelEdges(rect.x, rect.width, width, scale)),
      ],
      width
    );
    for (let column = 1; column < xs.length; column += 1) {
      // Bound synchronous page work; never silently fall back to live, mismatched geometry.
      if (++probes > 16_777_216) throw new Error('Selection geometry exceeds viewport budget');
      const left = xs[column - 1]!;
      const right = xs[column]!;
      const element = targetAt(document, (left + right) / 2, y);
      if (!element || !rects.has(element)) continue;
      const previous = regions.at(-1);
      if (
        previous?.element === element &&
        previous.y === top &&
        previous.x + previous.width === left
      ) {
        previous.width += right - left;
      } else {
        regions.push({ element, x: left, y: top, width: right - left, height: bottom - top });
      }
    }
  }
  return regions;
}

/** Mounts the retained raster below selection chrome; the parent owns its removal. */
export function mountFrozenSelectionFrame(
  container: HTMLElement | null,
  frame: FrozenSelectionFrame
): void {
  frame.geometry.assertViewport();
  if (!container) throw new Error('Selection overlay unavailable');
  const image = document.createElement('img');
  const host = document.createElement('div');
  host.className = 'sniptale-selection-frozen-frame';
  // Created in the content isolated world; the page must never obtain the raster URL or node.
  const privateRoot = host.attachShadow({ mode: 'closed' });
  image.alt = '';
  image.draggable = false;
  image.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${frame.geometry.width}px;
    height: ${frame.geometry.height}px;
    pointer-events: auto;
  `;
  host.style.cssText = image.style.cssText;
  image.src = frame.dataUrl;
  privateRoot.append(image);
  container.prepend(host);
}

/** Decode before activation so failed image loading cannot expose a live page beneath frozen bounds. */
export async function prepareFrozenSelectionFrame(frame: FrozenSelectionFrame): Promise<void> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load selection frame'));
    image.src = frame.dataUrl;
  });
  frame.geometry.assertViewport();
}

/** Ends a frozen session when the browser changes its coordinate system. */
export function watchFrozenSelectionViewport(
  geometry: FrozenSelectionGeometry,
  onInvalid: () => void
): () => void {
  const check = () => {
    try {
      geometry.assertViewport();
    } catch {
      onInvalid();
    }
  };
  window.addEventListener('resize', check);
  window.visualViewport?.addEventListener('resize', check);
  return () => {
    window.removeEventListener('resize', check);
    window.visualViewport?.removeEventListener('resize', check);
  };
}
