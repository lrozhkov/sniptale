import { sanitizeHtmlFragment } from '@sniptale/platform/security/sanitizers/html';
import {
  hasUnsafeHistoryAttributes,
  isManagedHistoryAttribute,
  normalizeHistoryAttributes,
} from './attributes';
import { hasExactHistoryLocatorBinding, withHistoryLocatorCapture } from './dom-locators';
import type { PageDomElementState, PageDomMutationBatch, PageDomMutationPatch } from './types';
import type { PagePreparationDomElement } from './types';

const HISTORY_DOM_SANITIZER_OPTIONS = {
  allowedAttributes: [
    'alt',
    'class',
    'colspan',
    'data-sniptale-id',
    'height',
    'href',
    'rel',
    'rowspan',
    'src',
    'target',
    'title',
    'width',
  ],
  allowedTags: [
    'a',
    'b',
    'blockquote',
    'br',
    'caption',
    'code',
    'div',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
};
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function replaceWithSanitizedFragment(target: PagePreparationDomElement, html: string): void {
  const sanitizedHtml = sanitizeHtmlFragment(html, HISTORY_DOM_SANITIZER_OPTIONS);
  const range = target.ownerDocument.createRange();

  range.selectNodeContents(target);
  target.replaceChildren(range.createContextualFragment(sanitizedHtml));
}

function captureSafeAttributes(element: PagePreparationDomElement): Record<string, string> {
  const rawAttributes: Record<string, string> = {};

  Array.from(element.attributes).forEach((attribute) => {
    if (isManagedHistoryAttribute(element, attribute)) {
      rawAttributes[attribute.name] = attribute.value;
    }
  });

  return normalizeHistoryAttributes(element, rawAttributes);
}

function areElementAttributesEqual(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return leftKeys.length === rightKeys.length && leftKeys.every((key) => right[key] === left[key]);
}

function areElementStatesEqual(left: PageDomElementState, right: PageDomElementState): boolean {
  return left.html === right.html && areElementAttributesEqual(left.attributes, right.attributes);
}

function applyElementAttributes(
  target: PagePreparationDomElement,
  attributes: Record<string, string>
): void {
  const nextAttributes = normalizeHistoryAttributes(target, attributes);

  Array.from(target.attributes).forEach((attribute) => {
    if (!isManagedHistoryAttribute(target, attribute)) {
      return;
    }

    const normalizedCurrent = normalizeHistoryAttributes(target, {
      [attribute.name]: attribute.value,
    });
    if (
      normalizedCurrent[attribute.name] !== attribute.value ||
      !Object.prototype.hasOwnProperty.call(nextAttributes, attribute.name)
    ) {
      target.removeAttributeNode(attribute);
    }
  });

  Object.entries(nextAttributes).forEach(([name, value]) => {
    if (target.getAttribute(name) !== value) {
      target.setAttribute(name, value);
    }
  });
}

function applyElementState(
  target: PagePreparationDomElement,
  nextState: PageDomElementState
): void {
  if (target.namespaceURI === HTML_NAMESPACE && target.innerHTML !== nextState.html) {
    replaceWithSanitizedFragment(target, nextState.html);
  }

  applyElementAttributes(target, nextState.attributes);
}

export function captureDomElementState(element: PagePreparationDomElement): PageDomElementState {
  return {
    attributes: captureSafeAttributes(element),
    // SVG history is intentionally inline-style-only; HTML tag policy must not rewrite SVG children.
    html: element.namespaceURI === HTML_NAMESPACE ? element.innerHTML : '',
  };
}

export function createDomMutationPatch(element: PagePreparationDomElement): PageDomMutationPatch {
  return withHistoryLocatorCapture((getLocator) => {
    const locator = getLocator(element);
    const before = captureDomElementState(element);

    return {
      after: before,
      before,
      locator,
      target: element,
    };
  });
}

export function createDomMutationBatch(
  elements: Iterable<PagePreparationDomElement>,
  beforeStates = new Map<string, PageDomElementState>()
): PageDomMutationBatch {
  return withHistoryLocatorCapture((getLocator) => {
    const patches: PageDomMutationPatch[] = [];

    for (const element of elements) {
      const locator = getLocator(element);
      const before = beforeStates.get(locator) ?? captureDomElementState(element);
      patches.push({
        after: captureDomElementState(element),
        before,
        locator,
        target: element,
      });
    }

    return { patches };
  });
}

export function captureDomStateMap(
  elements: Iterable<PagePreparationDomElement>
): Map<string, PageDomElementState> {
  return withHistoryLocatorCapture((getLocator) => {
    const result = new Map<string, PageDomElementState>();

    for (const element of elements) {
      result.set(getLocator(element), captureDomElementState(element));
    }

    return result;
  });
}

export function applyDomMutationBatch(
  batch: PageDomMutationBatch | null,
  direction: 'undo' | 'redo'
): { missingLocators: string[]; success: boolean } {
  if (!batch) {
    return { missingLocators: [], success: true };
  }

  const resolvedPatches = batch.patches.map((patch) => {
    const hasExactBoundTarget = hasExactHistoryLocatorBinding(patch.target, patch.locator);
    return {
      patch,
      target: hasExactBoundTarget ? patch.target : null,
    };
  });

  const missingLocators = resolvedPatches
    .filter((resolvedPatch) => !resolvedPatch.target)
    .map((resolvedPatch) => resolvedPatch.patch.locator);
  if (missingLocators.length > 0) {
    return { missingLocators, success: false };
  }

  resolvedPatches.forEach((resolvedPatch) => {
    const target = resolvedPatch.target as PagePreparationDomElement;
    const nextState = direction === 'undo' ? resolvedPatch.patch.before : resolvedPatch.patch.after;
    if (
      hasUnsafeHistoryAttributes(target) ||
      !areElementStatesEqual(captureDomElementState(target), nextState)
    ) {
      applyElementState(target, nextState);
    }
  });

  return { missingLocators: [], success: true };
}
