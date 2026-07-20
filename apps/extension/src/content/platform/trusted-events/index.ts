export function isTrustedDomEvent(event: Event): boolean {
  return event.isTrusted === true;
}

export function isTrustedKeyboardEvent(event: Event): boolean {
  return isTrustedDomEvent(event);
}

export function isTrustedMouseEvent(event: Event): boolean {
  return isTrustedDomEvent(event);
}

export function isTrustedPointerEvent(event: Event): boolean {
  return isTrustedDomEvent(event);
}
