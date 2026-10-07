import { resolveRecordingTarget } from '../../../features/video/project/recording-target';

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
  clickElement?: Element;
  data: Record<string, string>;
} {
  const { element, identity, editableBlocked } = resolveTargetElements(event);
  if (!element) return { element: null, data: {} };
  const data: Record<string, string> = { targetTag: element.localName };
  if (element instanceof HTMLInputElement) {
    data['targetType'] = element.type;
    if (element.hasAttribute('list')) data['targetHasList'] = 'yes';
  }
  const role = plainLabel(element.getAttribute('role'));
  if (role) data['targetRole'] = role;
  if (element.matches('a[href]')) data['targetHasHref'] = 'yes';
  if (
    !editableBlocked &&
    element.matches(
      '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]'
    )
  )
    data['targetEditable'] = 'yes';
  const semantics = resolveRecordingTarget(data);
  data['targetKind'] = semantics.kind;
  data['targetSource'] = semantics.source;
  if (semantics.kind === 'unknown' && !element.matches(CONTROL_SELECTOR))
    return { element: identity, data };
  const name = controlLabel(element);
  if (name) data['targetName'] = name;
  return {
    element: identity,
    ...(semantics.kind !== 'unknown' ? { clickElement: element } : {}),
    data,
  };
}

function controlLabel(element: Element): string {
  const references = (element.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const root = element.getRootNode();
  const labelRoot = root instanceof ShadowRoot ? root : element.ownerDocument;
  const referencedName = references
    .map((id) => staticLabel(labelRoot.getElementById(id)))
    .join(' ');
  const labels =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? Array.from(element.labels ?? [])
          .map(staticLabel)
          .join(' ')
      : '';
  return (
    plainLabel(element.getAttribute('aria-label')) ||
    plainLabel(referencedName) ||
    plainLabel(labels) ||
    (element.matches('button,a,[role="button"],[role="link"],[role="menuitem"],[role="tab"]')
      ? staticLabel(element)
      : '')
  );
}

function resolveTargetElements(event: Event | null) {
  const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
  const target =
    path.find((node): node is Element => node instanceof Element) ??
    (event?.target instanceof Element ? event.target : null);
  // Preserve the previous identity used by keyboard privacy and typing checks.
  const identity = target?.closest(CONTROL_SELECTOR) ?? target;
  const candidates = path.filter((node): node is Element => node instanceof Element);
  if (!candidates.length && target) {
    for (let node: Element | null = target; node; node = node.parentElement) candidates.push(node);
  }
  let editableBlocked = false;
  const candidate =
    candidates.find((node) => {
      const editable = node.getAttribute('contenteditable');
      if (editable === 'false') editableBlocked = true;
      return (
        node.matches('button,input,textarea,select,a[href]') ||
        (node instanceof HTMLLabelElement && !!node.control) ||
        resolveRecordingTarget({ targetRole: node.getAttribute('role') }).kind !== 'unknown' ||
        (!editableBlocked &&
          (editable === '' || editable === 'true' || editable === 'plaintext-only'))
      );
    }) ?? target;
  const element =
    candidate instanceof HTMLLabelElement ? (candidate.control ?? candidate) : candidate;
  return { element, identity, editableBlocked };
}
