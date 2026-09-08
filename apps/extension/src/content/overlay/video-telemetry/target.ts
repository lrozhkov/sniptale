const CONTROL_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  ...['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'textbox', 'combobox'].map(
    (role) => `[role="${role}"]`
  ),
].join(',');
const EDITABLE_SELECTOR =
  'input,textarea,select,option,optgroup,[contenteditable]:not([contenteditable="false"])';

function plainLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function staticLabel(element: Element | null): string {
  if (
    !element ||
    element.matches(EDITABLE_SELECTOR) ||
    element.closest('[contenteditable]:not([contenteditable="false"])')
  )
    return '';
  const text: string[] = [];
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        node instanceof Element &&
        node.matches(`${EDITABLE_SELECTOR},script,style,[hidden],[aria-hidden="true"]`)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    }
  );
  let length = 0;
  for (let visited = 0; visited < 256 && length < 120; visited += 1) {
    const node = walker.nextNode();
    if (!node) break;
    if (node.nodeType === Node.TEXT_NODE) {
      const part = (node.textContent ?? '').slice(0, 120 - length);
      text.push(part);
      length += part.length;
    }
  }
  return plainLabel(text.join(' '));
}

/** Describes the control, never its value or surrounding page content. DOM identity is disposable. */
export function describeTelemetryTarget(event: Event | null): {
  element: Element | null;
  data: Record<string, string>;
} {
  const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
  const target =
    path.find((node): node is Element => node instanceof Element) ??
    (event?.target instanceof Element ? event.target : null);
  const element = target?.closest(CONTROL_SELECTOR) ?? target;
  if (!element) return { element: null, data: {} };
  const data: Record<string, string> = { targetTag: element.localName };
  const role = plainLabel(element.getAttribute('role'));
  if (role) data['targetRole'] = role;
  if (!element.matches(CONTROL_SELECTOR)) return { element, data };
  const references = (element.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const referencedName = references
    .map((id) => staticLabel(element.ownerDocument.getElementById(id)))
    .join(' ');
  const labels =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? Array.from(element.labels ?? [])
          .map(staticLabel)
          .join(' ')
      : '';
  const name =
    plainLabel(element.getAttribute('aria-label')) ||
    plainLabel(referencedName) ||
    plainLabel(labels) ||
    (element.matches('button,a,[role="button"],[role="link"],[role="menuitem"],[role="tab"]')
      ? staticLabel(element)
      : '');
  if (name) data['targetName'] = name;
  return { element, data };
}
