import { isComposedEventWithinAnyElement } from '../dom-events';

export const FLOATING_INTERACTION_ROOT_ATTRIBUTE = 'data-floating-ui-root';
const FLOATING_INTERACTION_ROOT_SELECTOR = `[${FLOATING_INTERACTION_ROOT_ATTRIBUTE}="true"]`;

type ComposedEventLike = Pick<Event, 'target'> & {
  composedPath?: () => EventTarget[];
};

function getComposedPath(event: ComposedEventLike): EventTarget[] {
  if (typeof event.composedPath === 'function') {
    return event.composedPath();
  }

  return event.target ? [event.target] : [];
}

function eventTargetToElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (typeof ShadowRoot !== 'undefined' && target instanceof ShadowRoot) {
    return target.host;
  }

  return target instanceof Node ? target.parentElement : null;
}

export function isFloatingInteractionTarget(target: EventTarget | null): boolean {
  const element = eventTargetToElement(target);
  return Boolean(element?.closest(FLOATING_INTERACTION_ROOT_SELECTOR));
}

export function isFloatingInteractionEvent(event: ComposedEventLike): boolean {
  return getComposedPath(event).some(isFloatingInteractionTarget);
}

export function isOwnedFloatingInteractionEvent(
  event: ComposedEventLike,
  owners: Iterable<Element | null>
): boolean {
  return isComposedEventWithinAnyElement(event, owners);
}

export function isFloatingInteractionOutsideOwners(
  event: ComposedEventLike,
  owners: Iterable<Element | null>
): boolean {
  return !isOwnedFloatingInteractionEvent(event, owners) && !isFloatingInteractionEvent(event);
}
