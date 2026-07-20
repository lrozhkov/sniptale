import { findElementBySelector } from '../../../platform/frame';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import { sanitizeHtmlFragment } from '@sniptale/platform/security/sanitizers/html';
import { hasUnsafeHistoryAttributes, normalizeHistoryAttributes } from './attributes';
import type { PageDomElementState, PageDomMutationBatch, PageDomMutationPatch } from './types';

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
let pagePreparationHistoryElementId = 0;

function replaceWithSanitizedFragment(target: HTMLElement, html: string): void {
  const sanitizedHtml = sanitizeHtmlFragment(html, HISTORY_DOM_SANITIZER_OPTIONS);
  const range = target.ownerDocument.createRange();

  range.selectNodeContents(target);
  target.replaceChildren(range.createContextualFragment(sanitizedHtml));
}

function ensureStableHistoryLocator(element: HTMLElement): void {
  if (element.dataset['sniptaleId']) {
    return;
  }

  pagePreparationHistoryElementId += 1;
  element.dataset['sniptaleId'] = `history-${pagePreparationHistoryElementId}`;
}

function buildCompositeLocator(element: HTMLElement): string {
  ensureStableHistoryLocator(element);
  const selector = createCompositeSelector(element);
  return selector.iframeSelector
    ? `${selector.iframeSelector} => ${selector.elementSelector}`
    : selector.elementSelector;
}

function captureSafeAttributes(element: HTMLElement): Record<string, string> {
  const rawAttributes: Record<string, string> = {};

  Array.from(element.attributes).forEach((attribute) => {
    rawAttributes[attribute.name] = attribute.value;
  });

  return normalizeHistoryAttributes(element.ownerDocument, rawAttributes);
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

function applyElementAttributes(target: HTMLElement, attributes: Record<string, string>): void {
  const nextAttributes = normalizeHistoryAttributes(target.ownerDocument, attributes);

  Array.from(target.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase().startsWith('on')) {
      target.removeAttribute(attribute.name);
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(nextAttributes, attribute.name)) {
      target.removeAttribute(attribute.name);
    }
  });

  Object.entries(nextAttributes).forEach(([name, value]) => {
    if (target.getAttribute(name) !== value) {
      target.setAttribute(name, value);
    }
  });
}

function applyElementState(target: HTMLElement, nextState: PageDomElementState): void {
  if (target.innerHTML !== nextState.html) {
    replaceWithSanitizedFragment(target, nextState.html);
  }

  applyElementAttributes(target, nextState.attributes);
}

export function captureDomElementState(element: HTMLElement): PageDomElementState {
  return {
    attributes: captureSafeAttributes(element),
    html: element.innerHTML,
  };
}

export function createDomMutationPatch(element: HTMLElement): PageDomMutationPatch {
  const locator = buildCompositeLocator(element);
  const before = captureDomElementState(element);

  return {
    after: before,
    before,
    locator,
  };
}

export function createDomMutationBatch(
  elements: Iterable<HTMLElement>,
  beforeStates = new Map<string, PageDomElementState>()
): PageDomMutationBatch {
  const patches: PageDomMutationPatch[] = [];

  for (const element of elements) {
    const locator = buildCompositeLocator(element);
    const before = beforeStates.get(locator) ?? captureDomElementState(element);
    patches.push({
      after: captureDomElementState(element),
      before,
      locator,
    });
  }

  return { patches };
}

export function captureDomStateMap(
  elements: Iterable<HTMLElement>
): Map<string, PageDomElementState> {
  const result = new Map<string, PageDomElementState>();

  for (const element of elements) {
    result.set(buildCompositeLocator(element), captureDomElementState(element));
  }

  return result;
}

export function applyDomMutationBatch(
  batch: PageDomMutationBatch | null,
  direction: 'undo' | 'redo'
): { missingLocators: string[]; success: boolean } {
  if (!batch) {
    return { missingLocators: [], success: true };
  }

  const resolvedPatches = batch.patches.map((patch) => ({
    patch,
    target: findElementBySelector(patch.locator),
  }));

  const missingLocators = resolvedPatches
    .filter((resolvedPatch) => !resolvedPatch.target)
    .map((resolvedPatch) => resolvedPatch.patch.locator);
  if (missingLocators.length > 0) {
    return { missingLocators, success: false };
  }

  resolvedPatches.forEach((resolvedPatch) => {
    const target = resolvedPatch.target as HTMLElement;
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
