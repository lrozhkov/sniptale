export const SETTINGS_POPOVER_WIDTH = 400;

export const SETTINGS_POPOVER_HEIGHT = 600;

/** Resolve a supported portal root, with the current document body as fallback. */
export function resolvePopoverPortalTarget(
  target: Element | DocumentFragment | undefined
): HTMLElement | ShadowRoot | DocumentFragment {
  return target instanceof HTMLElement ||
    target instanceof ShadowRoot ||
    target instanceof DocumentFragment
    ? target
    : document.body;
}
