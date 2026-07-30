// policyStateIds: [] - target eligibility sets are immutable DOM catalogs, not authority state.
import { isContentOwnedElement } from '../../../platform/dom-host';
import type { PageStyleMutationElement } from './types';

export type { PageStyleMutationElement } from './types';

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
  if (!view) {
    return false;
  }

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

function hasInlineStyleOwner(element: Element): element is PageStyleMutationElement {
  const style: unknown = Reflect.get(element, 'style');
  return (
    typeof style === 'object' &&
    style !== null &&
    typeof Reflect.get(style, 'getPropertyValue') === 'function' &&
    typeof Reflect.get(style, 'setProperty') === 'function'
  );
}

export function isPageStyleMutationElement(element: Element): element is PageStyleMutationElement {
  const namespace = element.namespaceURI;
  if (namespace !== HTML_NAMESPACE && namespace !== SVG_NAMESPACE) {
    return false;
  }
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

  return isRenderedElement(element);
}
