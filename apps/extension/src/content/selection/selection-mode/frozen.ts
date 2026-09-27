import { getFrozenHitShape, type FrozenHitShape } from './frozen-hit-shapes';
import { createSelectionCrosshairCursor } from './interaction/cursor';
import { translate } from '../../../platform/i18n';
import { isContentOwnedElement } from '../../platform/dom-host';
import { getAbsolutePosition, getIframeDocument } from '../../platform/frame';
import type { FrozenSelectionFrame, FrozenSelectionGeometry, Selection } from './types';

type HitRegion = Selection & { element: HTMLElement };
type HitBox = { rect: Selection; id: number };
type ShapedHitBox = { rect: Selection };
type ShapeGroup = {
  containsPoint: FrozenHitShape['containsPoint'];
  rect: Selection;
  id: number;
};
const MAX_SVG_SAMPLE_PIXELS = 20_000;

function contains(rect: Selection, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function isHtmlElement(element: Element): element is HTMLElement {
  return element.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

function isIframe(element: Element): element is HTMLIFrameElement {
  return isHtmlElement(element) && element.localName === 'iframe';
}

function collectElements(root: Document | ShadowRoot, depth = 0): Element[] {
  const result: Element[] = [];
  if (depth > 12) return result;
  for (const element of root.querySelectorAll('*')) {
    if (isContentOwnedElement(element)) continue;
    if (isHtmlElement(element) || element.namespaceURI === 'http://www.w3.org/2000/svg')
      result.push(element);
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
  const top = root.elementFromPoint?.(x, y);
  const element =
    top && !isContentOwnedElement(top)
      ? top
      : root.elementsFromPoint(x, y).find((candidate) => !isContentOwnedElement(candidate));
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
  const svgBounds: Selection[] = [];
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
      if (!isHtmlElement(element)) {
        svgBounds.push(rect);
        continue;
      }
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
  const shapeGroups: ShapeGroup[] = [];
  const shapedBoxes = [...rects].flatMap(([element, rect], id): ShapedHitBox[] => {
    const shape = getFrozenHitShape(element, rect, scale);
    if (shape.boxes.length > 0) shapeGroups.push({ rect, id, containsPoint: shape.containsPoint });
    return shape.boxes.map((box) => ({ rect: box }));
  });
  const areaOnly =
    svgBounds.reduce(
      (total, rect) =>
        total +
        Math.ceil(Math.min(width, rect.width) * scale) *
          Math.ceil(Math.min(height, rect.height) * scale),
      0
    ) > MAX_SVG_SAMPLE_PIXELS;
  const regions = areaOnly
    ? []
    : captureHitRegions(
        rects,
        fragments,
        shapedBoxes,
        shapeGroups,
        svgBounds,
        width,
        height,
        scale
      );
  return {
    width,
    height,
    scale,
    ...(areaOnly ? { areaOnly: true } : {}),
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
  shapedBoxes: ShapedHitBox[],
  shapeGroups: ShapeGroup[],
  svgBounds: Selection[],
  width: number,
  height: number,
  scale: number
): HitRegion[] {
  const boxes = [...rects.values(), ...fragments].map((rect, id): HitBox => ({ rect, id }));
  const hitCache = new Map<string, HTMLElement | null>();
  const edges = (values: number[], maximum: number) =>
    [
      ...new Set([0, maximum, ...values.map((value) => Math.max(0, Math.min(maximum, value)))]),
    ].sort((a, b) => a - b);
  const ys = edges(
    [
      ...boxes.flatMap(({ rect }) => [rect.y, rect.y + rect.height]),
      ...shapedBoxes.flatMap(({ rect }) => pixelEdges(rect.y, rect.height, height, scale)),
      ...svgBounds.flatMap((rect) => [
        rect.y,
        ...pixelEdges(rect.y, rect.height, height, scale),
        rect.y + rect.height,
      ]),
    ],
    height
  );
  const regions: HitRegion[] = [];
  let probes = 0;
  for (let row = 1; row < ys.length; row += 1) {
    const top = ys[row - 1]!;
    const bottom = ys[row]!;
    const y = (top + bottom) / 2;
    const rowBoxes = boxes.filter(({ rect }) => y >= rect.y && y < rect.y + rect.height);
    const rowShapes = shapedBoxes.filter(({ rect }) => y >= rect.y && y < rect.y + rect.height);
    const rowShapeGroups = shapeGroups.filter(
      ({ rect }) => y >= rect.y && y < rect.y + rect.height
    );
    const rowSvgBounds = svgBounds.filter((rect) => y >= rect.y && y < rect.y + rect.height);
    const xs = edges(
      [
        ...rowBoxes.flatMap(({ rect }) => [rect.x, rect.x + rect.width]),
        ...rowShapes.flatMap(({ rect }) => pixelEdges(rect.x, rect.width, width, scale)),
        ...rowSvgBounds.flatMap((rect) => [
          rect.x,
          ...pixelEdges(rect.x, rect.width, width, scale),
          rect.x + rect.width,
        ]),
      ],
      width
    );
    for (let column = 1; column < xs.length; column += 1) {
      // Bound synchronous page work; never silently fall back to live, mismatched geometry.
      if (++probes > 16_777_216) throw new Error('Selection geometry exceeds viewport budget');
      const left = xs[column - 1]!;
      const right = xs[column]!;
      const x = (left + right) / 2;
      const hitKey = buildHitCacheKey(x, y, rowBoxes, rowShapeGroups, rowSvgBounds);
      let element: HTMLElement | null;
      if (hitKey !== null && hitCache.has(hitKey)) {
        element = hitCache.get(hitKey) ?? null;
      } else {
        element = targetAt(document, x, y);
        if (hitKey !== null) hitCache.set(hitKey, element);
      }
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

/** Reuse browser hit order only when the same boxes and shape-side regions cover a cell. */
function buildHitCacheKey(
  x: number,
  y: number,
  rowBoxes: HitBox[],
  shapeGroups: ShapeGroup[],
  svgBounds: Selection[]
): string | null {
  if (svgBounds.some((rect) => contains(rect, x, y))) return null;
  const boxIds = rowBoxes
    .filter(({ rect }) => x >= rect.x && x < rect.x + rect.width)
    .map(({ id }) => id);
  const shapeSides: string[] = [];
  for (const shape of shapeGroups) {
    if (!contains(shape.rect, x, y)) continue;
    if (!shape.containsPoint) return null;
    const side = shape.containsPoint(x, y);
    if (side === null) return null;
    shapeSides.push(`${shape.id}:${side ? 1 : 0}`);
  }
  return `${boxIds.join(',')}|${shapeSides.join(',')}`;
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
  const cursor = createSelectionCrosshairCursor();
  image.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${frame.geometry.width}px;
    height: ${frame.geometry.height}px;
    pointer-events: auto;
    cursor: ${cursor};
  `;
  host.style.cssText = image.style.cssText;
  image.src = frame.dataUrl;
  privateRoot.append(image);
  container.prepend(host);
  if (frame.areaOnly) {
    const hint = document.createElement('div');
    hint.className = 'sniptale-selection-area-only-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = translate('content.overlayControls.manualAreaSelectionHint');
    hint.style.cssText = `
      position: fixed;
      top: 16px;
      left: 16px;
      max-width: min(320px, calc(100vw - 72px));
      padding: 8px 12px;
      border: 1px solid var(--sniptale-color-border-soft);
      border-radius: 8px;
      background: var(--sniptale-color-surface-panel);
      color: var(--sniptale-color-text-primary);
      box-shadow: var(--sniptale-shadow-md);
      font: 500 13px/1.35 var(--sniptale-font-sans);
      pointer-events: none;
      z-index: 1;
    `;
    container.append(hint);
  }
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
