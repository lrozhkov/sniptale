type ComposedEventLike = Pick<Event, 'target'> & {
  composedPath?: () => EventTarget[];
};

interface FloatingSurfaceWheelEvent extends ComposedEventLike {
  __sniptaleFloatingWheelContained?: boolean;
  currentTarget: EventTarget | null;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  preventDefault: () => void;
}

type ScrollAxis = 'x' | 'y';

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_SIZE_PX = 16;

function getEventPathTargets(event: ComposedEventLike): EventTarget[] {
  if (typeof event.composedPath === 'function') {
    return event.composedPath();
  }

  return event.target ? [event.target] : [];
}

export function getComposedEventTargetElement(event: ComposedEventLike): HTMLElement | null {
  const pathTarget = getEventPathTargets(event).find(
    (target): target is HTMLElement => target instanceof HTMLElement
  );
  if (pathTarget) {
    return pathTarget;
  }

  return event.target instanceof HTMLElement ? event.target : null;
}

export function isComposedEventWithinElement(
  event: ComposedEventLike,
  element: Element | null
): boolean {
  if (!element) {
    return false;
  }

  const pathTargets = getEventPathTargets(event);
  if (pathTargets.includes(element)) {
    return true;
  }

  for (const target of pathTargets) {
    if (target instanceof Node && element.contains(target)) {
      return true;
    }
  }

  return event.target instanceof Node ? element.contains(event.target) : false;
}

export function isComposedEventWithinAnyElement(
  event: ComposedEventLike,
  elements: Iterable<Element | null>
): boolean {
  for (const element of elements) {
    if (isComposedEventWithinElement(event, element)) {
      return true;
    }
  }

  return false;
}

function getWheelEventTargetElement(event: FloatingSurfaceWheelEvent): HTMLElement | null {
  const composedTarget = getComposedEventTargetElement(event);
  if (composedTarget) {
    return composedTarget;
  }

  return event.target instanceof Node ? event.target.parentElement : null;
}

function canElementScroll(element: HTMLElement, axis: ScrollAxis, delta: number): boolean {
  if (delta === 0) {
    return false;
  }

  const view = element.ownerDocument.defaultView;
  const overflow = view?.getComputedStyle(element)[axis === 'y' ? 'overflowY' : 'overflowX'];
  if (overflow !== 'auto' && overflow !== 'overlay' && overflow !== 'scroll') {
    return false;
  }

  const position = axis === 'y' ? element.scrollTop : element.scrollLeft;
  const viewportSize = axis === 'y' ? element.clientHeight : element.clientWidth;
  const contentSize = axis === 'y' ? element.scrollHeight : element.scrollWidth;
  const maxPosition = Math.max(0, contentSize - viewportSize);

  return delta < 0 ? position > 0 : position < maxPosition;
}

function findScrollableWheelOwner(
  target: HTMLElement,
  boundary: HTMLElement,
  axis: ScrollAxis,
  delta: number
): HTMLElement | null {
  let candidate: HTMLElement | null = target;
  while (candidate) {
    if (canElementScroll(candidate, axis, delta)) {
      return candidate;
    }
    if (candidate === boundary) {
      return null;
    }
    candidate = candidate.parentElement;
  }

  return null;
}

function resolveWheelDistance(
  delta: number,
  deltaMode: number,
  scrollOwner: HTMLElement,
  axis: ScrollAxis
): number {
  if (deltaMode === WHEEL_DELTA_LINE) {
    return delta * WHEEL_LINE_SIZE_PX;
  }
  if (deltaMode === WHEEL_DELTA_PAGE) {
    const viewportSize = axis === 'y' ? scrollOwner.clientHeight : scrollOwner.clientWidth;
    return delta * Math.max(1, viewportSize);
  }
  return delta;
}

function scrollWheelOwner(
  scrollOwner: HTMLElement | null,
  axis: ScrollAxis,
  delta: number,
  deltaMode: number
): void {
  if (!scrollOwner) {
    return;
  }

  const distance = resolveWheelDistance(delta, deltaMode, scrollOwner, axis);
  if (axis === 'y') {
    scrollOwner.scrollTop += distance;
  } else {
    scrollOwner.scrollLeft += distance;
  }
}

/**
 * Keeps wheel input inside a floating surface without allowing browser scroll chaining to its host.
 */
export function containFloatingSurfaceWheel(event: FloatingSurfaceWheelEvent): void {
  if (event.__sniptaleFloatingWheelContained) {
    return;
  }
  event.__sniptaleFloatingWheelContained = true;
  event.preventDefault();

  const boundary = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const target = getWheelEventTargetElement(event);
  if (!boundary || !target || !boundary.contains(target)) {
    return;
  }

  scrollWheelOwner(
    findScrollableWheelOwner(target, boundary, 'y', event.deltaY),
    'y',
    event.deltaY,
    event.deltaMode
  );
  scrollWheelOwner(
    findScrollableWheelOwner(target, boundary, 'x', event.deltaX),
    'x',
    event.deltaX,
    event.deltaMode
  );
}
