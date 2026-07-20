import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleProperty,
  type PageStyleSelectorIdentity,
} from '@sniptale/runtime-contracts/page-style';
import {
  createCompositeSelector,
  serializeCompositeSelector,
} from '../../../platform/frame/selectors';
import { isQuickEditStyleInspectableElement } from '../../../selection/quick-edit-runtime/elements';

type PageStyleElementKind = 'block' | 'image' | 'text';

export interface PageStyleSelectionSnapshot {
  domPath: string;
  element: HTMLElement;
  kind: PageStyleElementKind;
  patch: PageStylePatch;
  selector: PageStyleSelectorIdentity;
  selectorLabel: string;
  tagName: string;
  textPreview: string;
}

export type PageStyleDeclarationValueMap = Partial<Record<PageStyleProperty, string>>;

const EMPTY_STYLE_PATCH: PageStylePatch = {
  assets: [],
  declarations: [],
};

function normalizeComputedStyleValue(value: string): string {
  return value.trim();
}

function resolveElementKind(element: HTMLElement): PageStyleElementKind {
  if (element instanceof HTMLImageElement) {
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

function createElementCode(element: HTMLElement): string {
  const id = element.id ? `#${element.id}` : '';
  const className = [...element.classList]
    .slice(0, 2)
    .map((value) => `.${value}`)
    .join('');
  const base = `${element.tagName.toLowerCase()}${className}${id}`;

  if (id || className) {
    return base;
  }

  const parent = element.parentElement;
  if (!parent) {
    return base;
  }

  const sameTagSiblings = Array.from(parent.children).filter(
    (sibling) => sibling.tagName === element.tagName
  );
  return `${base}:nth-of-type(${sameTagSiblings.indexOf(element) + 1})`;
}

function createReadableDomPath(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

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
  element: HTMLElement
): PageStyleSelectionSnapshot | null {
  if (!isQuickEditStyleInspectableElement(element)) {
    return null;
  }

  const compositeSelector = createCompositeSelector(element);
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
    selector: {
      locator: serializeCompositeSelector(compositeSelector),
      ...(element.dataset['sniptaleId'] ? { sniptaleId: element.dataset['sniptaleId'] } : {}),
    },
    selectorLabel: createElementCode(element),
    tagName: element.tagName.toLowerCase(),
    textPreview: element.textContent?.trim().slice(0, 80) ?? '',
  };
}

export function findInspectablePageStyleElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) {
    return null;
  }

  let element =
    target.nodeType === Node.ELEMENT_NODE ? (target as HTMLElement) : target.parentElement;

  while (element && element !== element.ownerDocument.body) {
    if (isQuickEditStyleInspectableElement(element)) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
}
