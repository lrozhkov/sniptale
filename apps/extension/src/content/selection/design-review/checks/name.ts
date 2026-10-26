import { isContentOwnedElement } from '../../../platform/dom-host';

type CheckName = { kind: 'named' | 'empty' | 'unknown'; text: string; source: string };
type ReadStyle = (element: Element) => CSSStyleDeclaration | null;
const normalize = (value: string) => value.replace(/\s+/gu, ' ').trim();

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function readText(element: Element, readStyle: ReadStyle, includeHidden = false) {
  let node: Node | null = element;
  let count = 0,
    text = '',
    unknown = false;
  while (node && count < 32 && text.length < 160) {
    count += 1;
    let skip = false;
    if (node.nodeType === Node.TEXT_NODE)
      text += (node.nodeValue ?? '').slice(0, 160 - text.length);
    else if (isElement(node)) {
      const metadataTitle =
        node.namespaceURI === 'http://www.w3.org/2000/svg' && node.localName === 'title';
      const style = includeHidden || metadataTitle ? null : readStyle(node);
      skip =
        isContentOwnedElement(node) ||
        ['script', 'style', 'template'].includes(node.localName) ||
        (!includeHidden &&
          (node.hasAttribute('hidden') ||
            node.getAttribute('aria-hidden') === 'true' ||
            style?.display === 'none' ||
            style?.visibility === 'hidden'));
      if (!skip && node !== element) {
        const rawLabel = node.getAttribute('aria-label');
        const label = rawLabel?.slice(0, 160);
        unknown ||= Boolean(rawLabel && rawLabel.length > 160 && !label?.trim());
        const rawAlt = node.localName === 'img' ? node.getAttribute('alt') : null;
        const alt = rawAlt?.slice(0, 160);
        unknown ||= Boolean(rawAlt && rawAlt.length > 160 && !alt?.trim());
        if (label?.trim() || alt?.trim()) {
          text += (label || alt || '').slice(0, 160 - text.length);
          skip = true;
        } else if (node.hasAttribute('aria-labelledby')) {
          unknown = true;
          skip = true;
        }
      }
    }
    if (
      !skip &&
      !(isElement(node) && ['input', 'select', 'textarea'].includes(node.localName)) &&
      node.firstChild
    ) {
      node = node.firstChild;
      continue;
    }
    while (node && node !== element && !node.nextSibling) node = node.parentNode;
    node = node === element ? null : (node?.nextSibling ?? null);
  }
  return { text: normalize(text), unknown: unknown || Boolean(node) };
}

function referencedLabel(element: Element, id: string): Element | null {
  const root = element.getRootNode(),
    view = element.ownerDocument.defaultView;
  if (root.nodeType === Node.DOCUMENT_NODE) return element.ownerDocument.getElementById(id);
  return view && root instanceof view.ShadowRoot ? root.getElementById(id) : null;
}

type NameEvidence = { text: string; unknown: boolean };

function readNameAttribute(element: Element, attribute: string): NameEvidence {
  const raw = element.getAttribute(attribute);
  const text = raw?.slice(0, 160) ?? '';
  return { text: normalize(text), unknown: Boolean(raw && raw.length > 160 && !text.trim()) };
}

function readReferencedName(element: Element, readStyle: ReadStyle): NameEvidence {
  const raw = element.getAttribute('aria-labelledby');
  if (!raw?.slice(0, 1024).trim()) return { text: '', unknown: Boolean(raw && raw.length > 1024) };
  const ids = raw.slice(0, 1024).trim().split(/\s+/u);
  let unknown = raw.length > 1024 || ids.length > 8;
  const texts: string[] = [];
  for (const id of ids.slice(0, 8)) {
    const label = referencedLabel(element, id);
    if (!label) {
      unknown = true;
      continue;
    }
    const result = readText(label, readStyle, true);
    unknown ||= result.unknown;
    if (result.text) texts.push(result.text);
  }
  return { text: texts.join(' ').slice(0, 160), unknown };
}

function readNativeName(
  element: Element,
  readStyle: ReadStyle
): {
  resolved: CheckName | null;
  unknown: boolean;
} {
  const view = element.ownerDocument.defaultView;
  if (
    !view ||
    !(
      element instanceof view.HTMLInputElement ||
      element instanceof view.HTMLSelectElement ||
      element instanceof view.HTMLTextAreaElement
    )
  )
    return { resolved: null, unknown: false };
  const labels = element.labels;
  let unknown = Boolean(labels && labels.length > 8);
  for (let index = 0; index < Math.min(labels?.length ?? 0, 8); index += 1) {
    const label = labels?.item(index);
    if (!label) continue;
    const evidence = readText(label, readStyle, true);
    unknown ||= evidence.unknown;
    if (evidence.text)
      return { resolved: { kind: 'named', text: evidence.text, source: 'label' }, unknown };
  }
  if (!(element instanceof view.HTMLInputElement)) return { resolved: null, unknown };
  if (['submit', 'reset', 'button'].includes(element.type))
    return { resolved: { kind: 'unknown', text: '', source: 'native-control' }, unknown };
  if (element.type === 'image') {
    const alt = readNameAttribute(element, 'alt');
    unknown ||= alt.unknown;
    if (alt.text) return { resolved: { kind: 'named', text: alt.text, source: 'alt' }, unknown };
  }
  return { resolved: null, unknown };
}

/** Reads bounded authoring evidence. It does not implement the browser accessibility-name algorithm. */
export function readCheckName(
  element: Element,
  readStyle: ReadStyle = (target) =>
    target.ownerDocument.defaultView?.getComputedStyle(target) ?? null
): CheckName {
  const references = readReferencedName(element, readStyle);
  if (references.text) return { kind: 'named', text: references.text, source: 'aria-labelledby' };
  const aria = readNameAttribute(element, 'aria-label');
  if (aria.text) return { kind: 'named', text: aria.text, source: 'aria-label' };
  const native = readNativeName(element, readStyle);
  if (native.resolved) return native.resolved;
  const contents = readText(element, readStyle);
  if (contents.text) return { kind: 'named', text: contents.text, source: 'contents' };
  const title = readNameAttribute(element, 'title');
  if (title.text) return { kind: 'named', text: title.text, source: 'title' };
  const unknown =
    references.unknown || aria.unknown || native.unknown || contents.unknown || title.unknown;
  return { kind: unknown ? 'unknown' : 'empty', text: '', source: unknown ? 'unresolved' : 'none' };
}
