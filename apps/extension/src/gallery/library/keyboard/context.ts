/** Controls that already own editing, selection, or navigation keys. Checkbox admission is
 * deliberately preserved for the existing Delete command. */
const ownKeyboardControlSelector = [
  'textarea',
  'select',
  'input:not([type="checkbox"])',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[aria-haspopup="listbox"]',
  '[aria-haspopup="menu"]',
  '[role="tablist"]',
  '[role="tree"]',
].join(',');

export function hasGalleryKeyboardLayer(): boolean {
  return Array.from(
    document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"], [role="listbox"]')
  ).some((layer) => !layer.closest('[hidden], [aria-hidden="true"], [inert]'));
}

export function isGalleryListKeyboardTarget(
  target: EventTarget | null,
  grid: HTMLElement | null
): boolean {
  return (
    target instanceof HTMLElement &&
    !target.closest(ownKeyboardControlSelector) &&
    Boolean(grid && (target === document.body || grid.contains(target)))
  );
}

export function hasGalleryPrimaryModifier(event: KeyboardEvent): boolean {
  const apple = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
