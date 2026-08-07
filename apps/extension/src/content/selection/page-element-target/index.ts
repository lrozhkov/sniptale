// policyStateIds: [] - selectable target catalogs are immutable DOM policy, not authority state.
import { isContentOwnedElement } from '../../platform/dom-host';
import { resolvePagePreparationElement } from '../../parser/page-preparation/target';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const INELIGIBLE_HTML_TARGETS = new Set([
  'base',
  'head',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
  'title',
]);
const SVG_SMIL_TARGETS = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'discard',
  'set',
]);
const SVG_RESOURCE_TARGETS = new Set([
  'clippath',
  'defs',
  'filter',
  'lineargradient',
  'marker',
  'mask',
  'metadata',
  'pattern',
  'radialgradient',
  'symbol',
]);

export type SelectablePageElement = HTMLElement | SVGElement;

function isElementNode(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'nodeType') === Node.ELEMENT_NODE
  );
}

function isSvgResourceOwner(element: Element): boolean {
  let current: Element | null = element;
  while (current?.namespaceURI === SVG_NAMESPACE) {
    const localName = current.localName.toLowerCase();
    if (
      SVG_RESOURCE_TARGETS.has(localName) ||
      SVG_SMIL_TARGETS.has(localName) ||
      localName.startsWith('fe')
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function hasVisibleBox(element: Element): boolean {
  try {
    return Array.from(element.getClientRects()).some((rect) => rect.width > 0 || rect.height > 0);
  } catch {
    return false;
  }
}

function isRenderedElement(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;

  try {
    const style = view.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      Number.parseFloat(style.opacity || '1') > 0 &&
      hasVisibleBox(element)
    );
  } catch {
    return false;
  }
}

function hasInlineStyleOwner(element: Element): element is SelectablePageElement {
  const style: unknown = Reflect.get(element, 'style');
  return (
    typeof style === 'object' &&
    style !== null &&
    typeof Reflect.get(style, 'getPropertyValue') === 'function' &&
    typeof Reflect.get(style, 'setProperty') === 'function'
  );
}

export function isRestorablePageElement(element: Element): element is SelectablePageElement {
  const namespace = element.namespaceURI;
  if (namespace !== HTML_NAMESPACE && namespace !== SVG_NAMESPACE) return false;
  if (!element.isConnected || isContentOwnedElement(element) || !hasInlineStyleOwner(element)) {
    return false;
  }

  const localName = element.localName.toLowerCase();
  if (
    (namespace === HTML_NAMESPACE && INELIGIBLE_HTML_TARGETS.has(localName)) ||
    (namespace === SVG_NAMESPACE && isSvgResourceOwner(element))
  ) {
    return false;
  }
  return true;
}

export function isSelectablePageElement(element: Element): element is SelectablePageElement {
  return isRestorablePageElement(element) && isRenderedElement(element);
}

function getAssociatedLabels(element: Element): Element[] {
  const labels: unknown = Reflect.get(element, 'labels');
  if (typeof labels !== 'object' || labels === null) return [];
  const length: unknown = Reflect.get(labels, 'length');
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) return [];

  const result: Element[] = [];
  for (let index = 0; index < length; index += 1) {
    const label: unknown = Reflect.get(labels, String(index));
    if (isElementNode(label)) result.push(label);
  }
  return result;
}

function getComposedParentElement(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;

  const root = element.getRootNode();
  if (root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return null;
  const host: unknown = Reflect.get(root, 'host');
  return isElementNode(host) ? host : null;
}

function resolveComposedPageElement(event: Event, iframe?: HTMLIFrameElement): Element | null {
  const composedTargets = event.composedPath().filter(isElementNode);
  if (composedTargets.some((candidate) => isContentOwnedElement(candidate))) return null;

  const composedTarget = composedTargets[0];
  const resolved =
    iframe && composedTarget === iframe
      ? resolvePagePreparationElement(event, iframe)
      : (composedTarget ?? resolvePagePreparationElement(event, iframe));
  return resolved && !isContentOwnedElement(resolved) ? resolved : null;
}

export function projectSelectablePageElement<T>(
  element: Element,
  project: (element: SelectablePageElement) => T | null
): T | null {
  const candidates: Element[] = [element, ...getAssociatedLabels(element)];
  let ancestor = getComposedParentElement(element);
  while (ancestor) {
    candidates.push(ancestor);
    ancestor = getComposedParentElement(ancestor);
  }

  const visited = new Set<Element>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (!isSelectablePageElement(candidate)) continue;
    const projected = project(candidate);
    if (projected !== null) return projected;
  }
  return null;
}

export function resolveSelectablePageProjection<T>(
  event: Event,
  project: (element: SelectablePageElement) => T | null,
  iframe?: HTMLIFrameElement
): T | null {
  const element = resolveComposedPageElement(event, iframe);
  return element ? projectSelectablePageElement(element, project) : null;
}

export function resolveSelectablePageElement(
  event: Event,
  iframe?: HTMLIFrameElement
): SelectablePageElement | null {
  return resolveSelectablePageProjection(event, (element) => element, iframe);
}

function isAnnotationHtmlTarget(element: SelectablePageElement): element is HTMLElement {
  if (element.namespaceURI !== HTML_NAMESPACE) return false;
  const document = element.ownerDocument;
  if (element === document.documentElement || element === document.body) return false;
  const view = document.defaultView;
  if (!view) return false;

  return Array.from(element.getClientRects()).some((rect) => {
    const intersectionWidth = Math.min(rect.right, view.innerWidth) - Math.max(rect.left, 0);
    const intersectionHeight = Math.min(rect.bottom, view.innerHeight) - Math.max(rect.top, 0);
    return intersectionWidth > 0 && intersectionHeight > 0;
  });
}

function isHtmlTarget(element: SelectablePageElement): element is HTMLElement {
  return element.namespaceURI === HTML_NAMESPACE;
}

export function resolveDrawablePageHtmlElement(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  return resolveSelectablePageProjection(
    event,
    (element) => (isHtmlTarget(element) ? element : null),
    iframe
  );
}

export function resolveSelectablePageHtmlElement(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  return resolveSelectablePageProjection(
    event,
    (element) => (isAnnotationHtmlTarget(element) ? element : null),
    iframe
  );
}
