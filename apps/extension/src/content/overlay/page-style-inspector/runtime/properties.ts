import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleProperty,
} from '@sniptale/runtime-contracts/page-style';
import {
  isPageStyleMutationElement,
  type PageStyleMutationElement,
} from '../../../selection/quick-edit-runtime/page-style/element';

type PageStyleElementKind = 'block' | 'image' | 'text';

export interface PageStyleSelectionSnapshot {
  domPath: string;
  element: PageStyleMutationElement;
  kind: PageStyleElementKind;
  patch: PageStylePatch;
  selectorLabel: string;
  tagName: string;
  textPreview: string;
}

export type PageStyleDeclarationValueMap = Partial<Record<PageStyleProperty, string>>;

const EMPTY_STYLE_PATCH: PageStylePatch = {
  declarations: [],
};

function normalizeComputedStyleValue(value: string): string {
  return value.trim();
}

function resolveElementKind(element: Element): PageStyleElementKind {
  if (
    element.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
    element.localName.toLowerCase() === 'img'
  ) {
    return 'image';
  }

  return element.children.length > 0 ? 'block' : 'text';
}

function createComputedDeclaration(
  styles: CSSStyleDeclaration,
  property: PageStyleProperty
): PageStyleDeclaration {
  return {
    property,
    value: normalizeComputedStyleValue(styles.getPropertyValue(property)),
  };
}

function createElementCode(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const className = [...element.classList]
    .slice(0, 2)
    .map((value) => `.${value}`)
    .join('');
  const base = `${element.localName.toLowerCase()}${className}${id}`;

  if (id || className) {
    return base;
  }

  const parent = element.parentElement;
  if (!parent) {
    return base;
  }

  const sameTagSiblings = Array.from(parent.children).filter(
    (sibling) =>
      sibling.localName === element.localName && sibling.namespaceURI === element.namespaceURI
  );
  return `${base}:nth-of-type(${sameTagSiblings.indexOf(element) + 1})`;
}

function createReadableDomPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== current.ownerDocument.body && parts.length < 4) {
    parts.unshift(createElementCode(current));
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export function createPageStyleValuesFromPatch(
  patch: PageStylePatch
): PageStyleDeclarationValueMap {
  const values: PageStyleDeclarationValueMap = {};

  for (const declaration of patch.declarations) {
    if (declaration.value !== null) {
      values[declaration.property] = declaration.value;
    }
  }

  return values;
}

export function readPageStyleSelectionSnapshot(
  element: Element
): PageStyleSelectionSnapshot | null {
  if (!isPageStyleMutationElement(element)) {
    return null;
  }

  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!styles) {
    return null;
  }

  return {
    domPath: createReadableDomPath(element),
    element,
    kind: resolveElementKind(element),
    patch: {
      ...EMPTY_STYLE_PATCH,
      declarations: PAGE_STYLE_ALLOWED_PROPERTIES.map((property) =>
        createComputedDeclaration(styles, property)
      ),
    },
    selectorLabel: createElementCode(element),
    tagName: element.localName.toLowerCase(),
    textPreview: element.textContent?.trim().slice(0, 80) ?? '',
  };
}

export function findInspectablePageStyleElement(
  target: EventTarget | null
): PageStyleMutationElement | null {
  if (!target || typeof target !== 'object' || !('nodeType' in target)) {
    return null;
  }

  const node = target as Node;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element && isPageStyleMutationElement(element) ? element : null;
}
