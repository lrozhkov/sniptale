import { translate } from '../../../platform/i18n';

type Direction = 'left' | 'right' | 'top' | 'bottom';
export interface Measurement {
  direction: Direction;
  distance: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutMeasurement extends Measurement {
  scope: 'container' | 'viewport';
}

export function renderMeasurement(measurement: Measurement | LayoutMeasurement): HTMLElement {
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
  label.dataset['anchorX'] = String((measurement.x1 + measurement.x2) / 2);
  label.dataset['anchorY'] = String((measurement.y1 + measurement.y2) / 2);
  label.dataset['preferredLeft'] = String(midpointX);
  label.dataset['preferredTop'] = String(midpointY);
  label.dataset['measurementLabel'] = `${scope}:${measurement.direction}`;
  line.append(label);
  return line;
}

interface LabelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface MeasurementLabelPlacement {
  left: number;
  top: number;
  anchorX: number;
  anchorY: number;
}

function intersects(a: LabelRect, b: LabelRect): boolean {
  return (
    a.left < b.left + b.width + 4 &&
    a.left + a.width + 4 > b.left &&
    a.top < b.top + b.height + 4 &&
    a.top + a.height + 4 > b.top
  );
}

function placeLabel(
  desired: LabelRect,
  viewport: LabelRect,
  obstacles: LabelRect[],
  previous: MeasurementLabelPlacement | undefined,
  anchor: { x: number; y: number }
): LabelRect | null {
  const maxLeft = viewport.left + viewport.width - desired.width;
  const maxTop = viewport.top + viewport.height - desired.height;
  if (maxLeft < viewport.left || maxTop < viewport.top) return null;
  const valid = (rect: LabelRect) =>
    rect.left >= viewport.left &&
    rect.left <= maxLeft &&
    rect.top >= viewport.top &&
    rect.top <= maxTop &&
    !obstacles.some((other) => intersects(rect, other));
  if (previous) {
    const retained = {
      ...desired,
      left: previous.left + anchor.x - previous.anchorX,
      top: previous.top + anchor.y - previous.anchorY,
    };
    if (valid(retained)) return retained;
  }
  const xs = new Set([
    Math.max(viewport.left, Math.min(desired.left, maxLeft)),
    viewport.left,
    maxLeft,
    anchor.x - desired.width - 4,
    anchor.x + 4,
  ]);
  const ys = new Set([
    Math.max(viewport.top, Math.min(desired.top, maxTop)),
    viewport.top,
    maxTop,
    anchor.y - desired.height - 4,
    anchor.y + 4,
  ]);
  for (const obstacle of obstacles) {
    xs.add(obstacle.left - desired.width - 4);
    xs.add(obstacle.left + obstacle.width + 4);
    ys.add(obstacle.top - desired.height - 4);
    ys.add(obstacle.top + obstacle.height + 4);
  }
  const candidates = Array.from(xs).flatMap((left) =>
    Array.from(ys, (top) => ({ ...desired, left, top }))
  );
  candidates.sort(
    (a, b) =>
      Math.hypot(a.left - desired.left, a.top - desired.top) -
      Math.hypot(b.left - desired.left, b.top - desired.top)
  );
  return candidates.find(valid) ?? null;
}

function updateLeader(label: HTMLElement, rect: LabelRect, anchor: { x: number; y: number }) {
  const parent = label.parentElement;
  if (!parent) return;
  const namespace = 'http://www.w3.org/2000/svg';
  let leader = parent.querySelector('svg');
  if (!leader) {
    leader = document.createElementNS(namespace, 'svg');
    leader.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    const line = document.createElementNS(namespace, 'line');
    line.setAttribute('stroke', 'var(--sniptale-color-accent)');
    line.setAttribute('stroke-width', '1');
    leader.append(line);
    parent.prepend(leader);
  }
  const line = leader.firstElementChild;
  line?.setAttribute('x1', String(anchor.x));
  line?.setAttribute('y1', String(anchor.y));
  line?.setAttribute('x2', String(Math.max(rect.left, Math.min(anchor.x, rect.left + rect.width))));
  line?.setAttribute('y2', String(Math.max(rect.top, Math.min(anchor.y, rect.top + rect.height))));
}

/** Places measured labels in stable, free viewport space; guides retain their original anchors. */
export function layoutMeasurementLabels(
  layer: HTMLElement,
  selected: { x: number; y: number; width: number; height: number } | null,
  placements: Map<string, MeasurementLabelPlacement>
) {
  const visual = window.visualViewport;
  const viewport = {
    left: (visual?.offsetLeft ?? 0) + 4,
    top: (visual?.offsetTop ?? 0) + 4,
    width: (visual?.width ?? window.innerWidth) - 8,
    height: (visual?.height ?? window.innerHeight) - 8,
  };
  const obstacles: LabelRect[] = selected
    ? [{ left: selected.x, top: selected.y, width: selected.width, height: selected.height }]
    : [];
  const keys = new Set<string>();
  for (const label of layer.querySelectorAll<HTMLElement>('[data-measurement-label]')) {
    const key = label.dataset['measurementLabel'];
    if (!key) continue;
    keys.add(key);
    label.hidden = false;
    label.style.visibility = 'hidden';
    const measured = label.getBoundingClientRect();
    const anchor = { x: Number(label.dataset['anchorX']), y: Number(label.dataset['anchorY']) };
    const desired = {
      left: Number(label.dataset['preferredLeft']),
      top: Number(label.dataset['preferredTop']),
      width: measured.width,
      height: measured.height,
    };
    const rect = placeLabel(desired, viewport, obstacles, placements.get(key), anchor);
    if (!rect) {
      label.hidden = true;
      label.parentElement?.querySelector('svg')?.remove();
      placements.delete(key);
      continue;
    }
    label.style.left = `${rect.left}px`;
    label.style.top = `${rect.top}px`;
    label.style.visibility = 'visible';
    obstacles.push(rect);
    placements.set(key, { left: rect.left, top: rect.top, anchorX: anchor.x, anchorY: anchor.y });
    updateLeader(label, rect, anchor);
  }
  for (const key of placements.keys()) if (!keys.has(key)) placements.delete(key);
}
