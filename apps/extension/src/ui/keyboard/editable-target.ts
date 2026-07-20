export function isEditableElementTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.getAttribute('role') === 'textbox' ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}
