import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { getAbsolutePosition } from '../../platform/frame';
import { isSelectablePageElement } from '../page-element-target';
import { translate } from '../../../platform/i18n';

type Direction = 'left' | 'right' | 'top' | 'bottom';
interface Measurement {
  direction: Direction;
  distance: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LayoutMeasurement extends Measurement {
  scope: 'container' | 'viewport';
}

type Rect = ReturnType<typeof getAbsolutePosition>;

function measurementParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  const view = element.ownerDocument.defaultView;
  if (view && root instanceof view.ShadowRoot) return root.host;
  return view?.frameElement ?? null;
}

function intersectsVisibleAncestors(
  element: Element,
  rect: ReturnType<typeof getAbsolutePosition>
): boolean {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  let ancestor = measurementParent(element);
  while (ancestor) {
    const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
    if (!style || style.display === 'none' || Number.parseFloat(style.opacity || '1') === 0)
      return false;
    const clipsX = /^(auto|scroll|hidden|clip)$/u.test(style.overflowX || style.overflow);
    const clipsY = /^(auto|scroll|hidden|clip)$/u.test(style.overflowY || style.overflow);
    const frame = ancestor.localName === 'iframe';
    if (clipsX || clipsY || frame) {
      const bounds = getAbsolutePosition(ancestor);
      if (clipsX || frame) {
        left = Math.max(left, bounds.x);
        right = Math.min(right, bounds.x + bounds.width);
      }
      if (clipsY || frame) {
        top = Math.max(top, bounds.y);
        bottom = Math.min(bottom, bounds.y + bounds.height);
      }
      if (right <= left || bottom <= top) return false;
    }
    ancestor = measurementParent(ancestor);
  }
  return true;
}

function visibleRect(element: Element): ReturnType<typeof getAbsolutePosition> | null {
  if (!isSelectablePageElement(element)) return null;
  const local = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  if (
    !view ||
    local.width <= 0 ||
    local.height <= 0 ||
    local.right <= 0 ||
    local.bottom <= 0 ||
    local.left >= view.innerWidth ||
    local.top >= view.innerHeight
  )
    return null;
  const rect = getAbsolutePosition(element);
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    intersectsVisibleAncestors(element, rect)
    ? rect
    : null;
}

/** Nearest visible sibling per cardinal direction; ties retain DOM order. */
export function measureDesignReviewNeighbors(element: Element): Measurement[] {
  const source = visibleRect(element);
  if (!source) return [];
  const nearest = new Map<Direction, Measurement>();
  const accept = (measurement: Measurement) => {
    const previous = nearest.get(measurement.direction);
    if (!previous || previous.distance > measurement.distance)
      nearest.set(measurement.direction, measurement);
  };
  for (const sibling of element.parentNode?.children ?? []) {
    if (sibling === element) continue;
    const target = visibleRect(sibling);
    if (!target) continue;
    const overlapX =
      Math.min(source.x + source.width, target.x + target.width) - Math.max(source.x, target.x);
    const overlapY =
      Math.min(source.y + source.height, target.y + target.height) - Math.max(source.y, target.y);
    if (overlapY > 0) {
      const y = Math.max(source.y, target.y) + overlapY / 2;
      if (target.x >= source.x + source.width)
        accept({
          direction: 'right',
          distance: target.x - source.x - source.width,
          x1: source.x + source.width,
          y1: y,
          x2: target.x,
          y2: y,
        });
      if (target.x + target.width <= source.x)
        accept({
          direction: 'left',
          distance: source.x - target.x - target.width,
          x1: target.x + target.width,
          y1: y,
          x2: source.x,
          y2: y,
        });
    }
    if (overlapX > 0) {
      const x = Math.max(source.x, target.x) + overlapX / 2;
      if (target.y >= source.y + source.height)
        accept({
          direction: 'bottom',
          distance: target.y - source.y - source.height,
          x1: x,
          y1: source.y + source.height,
          x2: x,
          y2: target.y,
        });
      if (target.y + target.height <= source.y)
        accept({
          direction: 'top',
          distance: source.y - target.y - target.height,
          x1: x,
          y1: target.y + target.height,
          x2: x,
          y2: source.y,
        });
    }
  }
  return [...nearest.values()];
}

function containingMeasurementParent(element: Element, source: Rect): Rect | null {
  let parent = measurementParent(element);
  while (parent) {
    if (parent.localName !== 'body' && parent.localName !== 'html') {
      const bounds = getAbsolutePosition(parent);
      if (
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.x <= source.x &&
        bounds.y <= source.y &&
        bounds.x + bounds.width >= source.x + source.width &&
        bounds.y + bounds.height >= source.y + source.height
      ) {
        return bounds;
      }
    }
    parent = measurementParent(parent);
  }
  return null;
}

function viewportRect(): Rect {
  const viewport = window.visualViewport;
  return {
    x: viewport?.offsetLeft ?? 0,
    y: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function measureWithinBounds(source: Rect, bounds: Rect, scope: LayoutMeasurement['scope']) {
  const centerX = source.x + source.width / 2;
  const centerY = source.y + source.height / 2;
  const edges: Measurement[] = [
    {
      direction: 'left',
      distance: source.x - bounds.x,
      x1: bounds.x,
      y1: centerY,
      x2: source.x,
      y2: centerY,
    },
    {
      direction: 'right',
      distance: bounds.x + bounds.width - source.x - source.width,
      x1: source.x + source.width,
      y1: centerY,
      x2: bounds.x + bounds.width,
      y2: centerY,
    },
    {
      direction: 'top',
      distance: source.y - bounds.y,
      x1: centerX,
      y1: bounds.y,
      x2: centerX,
      y2: source.y,
    },
    {
      direction: 'bottom',
      distance: bounds.y + bounds.height - source.y - source.height,
      x1: centerX,
      y1: source.y + source.height,
      x2: centerX,
      y2: bounds.y + bounds.height,
    },
  ];
  return edges.filter((edge) => edge.distance >= 0).map((edge) => ({ ...edge, scope }));
}

/** Free space around an element in its nearest containing box and the visible viewport. */
export function measureDesignReviewLayout(element: Element): LayoutMeasurement[] {
  const source = visibleRect(element);
  if (!source) return [];
  const container = containingMeasurementParent(element, source);
  return [
    ...(container ? measureWithinBounds(source, container, 'container') : []),
    ...measureWithinBounds(source, viewportRect(), 'viewport'),
  ];
}

function renderMeasurement(measurement: Measurement | LayoutMeasurement): HTMLElement {
  const horizontal = measurement.direction === 'left' || measurement.direction === 'right';
  const line = document.createElement('div');
  line.dataset['direction'] = measurement.direction;
  const scope = 'scope' in measurement ? measurement.scope : 'neighbor';
  line.dataset['scope'] = scope;
  const stroke = scope === 'neighbor' ? 'solid' : scope === 'container' ? 'dashed' : 'dotted';
  Object.assign(line.style, {
    position: 'fixed',
    left: `${measurement.x1}px`,
    top: `${measurement.y1}px`,
    width: `${measurement.x2 - measurement.x1}px`,
    height: `${measurement.y2 - measurement.y1}px`,
    [horizontal ? 'borderTop' : 'borderLeft']: `${stroke} 1px var(--sniptale-color-accent)`,
  });
  if (scope === 'neighbor') {
    for (const end of [0, 100]) {
      const cap = document.createElement('span');
      cap.style.cssText = horizontal
        ? `position:absolute;left:${end}%;top:-3px;height:5px;border-left:1px solid var(--sniptale-color-accent)`
        : `position:absolute;top:${end}%;left:-3px;width:5px;border-top:1px solid var(--sniptale-color-accent)`;
      line.append(cap);
    }
  }
  const label = document.createElement('span');
  const prefix =
    scope === 'container'
      ? `${translate('content.designReview.parentDistanceLabel')}: `
      : scope === 'viewport'
        ? `${translate('content.designReview.viewportDistanceLabel')}: `
        : '';
  label.textContent = `${prefix}${Math.round(measurement.distance * 10) / 10} px`;
  Object.assign(label.style, {
    position: 'fixed',
    padding: '2px 4px',
    borderRadius: '3px',
    background: 'var(--sniptale-color-surface-panel)',
    color: 'var(--sniptale-color-text-primary)',
    border: '1px solid var(--sniptale-color-border-soft)',
    font: 'var(--sniptale-font-size-xs, 11px)/1.2 monospace',
    whiteSpace: 'nowrap',
  });
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const maxLeft = left + (viewport?.width ?? window.innerWidth) - (scope === 'neighbor' ? 70 : 130);
  const maxTop = top + (viewport?.height ?? window.innerHeight) - 24;
  const labelOffset = scope === 'neighbor' ? 4 : scope === 'container' ? 18 : 32;
  const midpointX = (measurement.x1 + measurement.x2) / 2 + (horizontal ? 4 : labelOffset);
  const midpointY = (measurement.y1 + measurement.y2) / 2 + (horizontal ? labelOffset : 4);
  label.style.left = `${Math.max(left + 4, Math.min(midpointX, maxLeft))}px`;
  label.style.top = `${Math.max(top + 4, Math.min(midpointY, maxTop))}px`;
  line.append(label);
  return line;
}

function renderLayoutGuides(element: Element): HTMLElement[] {
  const source = visibleRect(element);
  if (!source) return [];
  const viewport = viewportRect();
  const guides = [source.x, source.x + source.width].map((x) => {
    const line = document.createElement('div');
    line.dataset['scope'] = 'guide-vertical';
    Object.assign(line.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${viewport.y}px`,
      height: `${viewport.height}px`,
      borderLeft: '1px dotted var(--sniptale-color-accent)',
      opacity: '0.4',
    });
    return line;
  });
  for (const y of [source.y, source.y + source.height]) {
    const line = document.createElement('div');
    line.dataset['scope'] = 'guide-horizontal';
    Object.assign(line.style, {
      position: 'fixed',
      left: `${viewport.x}px`,
      top: `${y}px`,
      width: `${viewport.width}px`,
      borderTop: '1px dotted var(--sniptale-color-accent)',
      opacity: '0.4',
    });
    guides.push(line);
  }
  const container = containingMeasurementParent(element, source);
  if (container) {
    const outline = document.createElement('div');
    outline.dataset['scope'] = 'container-outline';
    Object.assign(outline.style, {
      position: 'fixed',
      left: `${container.x}px`,
      top: `${container.y}px`,
      width: `${container.width}px`,
      height: `${container.height}px`,
      border: '1px dashed var(--sniptale-color-accent)',
      boxSizing: 'border-box',
      opacity: '0.65',
    });
    guides.push(outline);
  }
  return guides;
}

/** Disposable projection; the picker owns activation, hover and teardown. */
export function createDesignReviewMeasurements() {
  let enabled = false;
  let expanded = false;
  let hovered: Element | null = null;
  let layer: HTMLElement | null = null;
  let frame = 0;
  let signature = '';
  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    layer?.remove();
    layer = null;
    signature = '';
  }
  function refresh() {
    if (!enabled || !hovered?.isConnected) {
      clear();
      return;
    }
    const measurements = [
      ...measureDesignReviewNeighbors(hovered),
      ...(expanded ? measureDesignReviewLayout(hovered) : []),
    ];
    const source = expanded ? visibleRect(hovered) : null;
    const next = JSON.stringify([
      measurements,
      source,
      source ? containingMeasurementParent(hovered, source) : null,
      window.innerWidth,
      window.innerHeight,
      window.visualViewport?.offsetLeft,
      window.visualViewport?.offsetTop,
      expanded ? translate('content.designReview.parentDistanceLabel') : null,
      expanded ? translate('content.designReview.viewportDistanceLabel') : null,
    ]);
    if (!layer) {
      layer = document.createElement('div');
      layer.dataset['ui'] = 'content.design-review.measurements';
      layer.dataset['floatingUiCaptureTransient'] = 'true';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:2147483645;scale:none;overflow:hidden;';
      appendToContentOverlayRoot(layer);
    }
    if (signature !== next) {
      const guides = expanded ? renderLayoutGuides(hovered) : [];
      layer.replaceChildren(...guides, ...measurements.map(renderMeasurement));
      signature = next;
    }
  }
  function track() {
    refresh();
    if (enabled && hovered?.isConnected) frame = requestAnimationFrame(track);
  }
  return {
    setEnabled(value: boolean) {
      enabled = value;
      clear();
      if (enabled && hovered) track();
    },
    setExpanded(value: boolean) {
      expanded = value;
      signature = '';
      refresh();
    },
    hover(element: Element | null) {
      hovered = element;
      if (!element) {
        clear();
        return;
      }
      refresh();
      if (enabled && !frame) frame = requestAnimationFrame(track);
    },
    dispose() {
      enabled = false;
      hovered = null;
      clear();
    },
  };
}
