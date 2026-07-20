type ComposedEventLike = Pick<Event, 'target'> & {
  composedPath?: () => EventTarget[];
};

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
