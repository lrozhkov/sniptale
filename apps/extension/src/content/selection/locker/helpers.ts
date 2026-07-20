import { EXTENSION_CLASS_PREFIX, QUICK_EDIT_TEXT_TAGS } from './helpers.constants';
import {
  hasFocusableTabIndex,
  hasInteractiveAttributes,
  hasInteractiveGwtClasses,
  hasInteractiveParent,
  hasNavigationAttributes,
  hasSniptaleClass,
  isEditableElement,
  isExtensionElement,
  isStandardInteractiveTag,
} from './helpers.predicates';

export function isInteractiveElementForLock(element: HTMLElement): boolean {
  if (isExtensionElement(element) || isEditableElement(element)) {
    return false;
  }

  if (isStandardInteractiveTag(element) || hasInteractiveAttributes(element)) {
    return true;
  }

  const role = element.getAttribute('role');
  if (hasFocusableTabIndex(element) || role === 'button' || role === 'link') {
    return true;
  }

  return hasInteractiveGwtClasses(element) || hasInteractiveParent(element);
}

export function isNavigationTargetForLock(element: HTMLElement): boolean {
  if (isExtensionElement(element) || isEditableElement(element)) {
    return false;
  }

  if (element instanceof HTMLAnchorElement && Boolean(element.getAttribute('href'))) {
    return true;
  }

  const role = element.getAttribute('role');
  return role === 'link' || hasNavigationAttributes(element);
}

export function getLockEventElements(event: Event): HTMLElement[] {
  const pathTargets = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const eventElements = pathTargets.filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
  if (eventElements.length > 0) {
    return eventElements;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return [];
  }

  const fallbackElements: HTMLElement[] = [];
  let current: HTMLElement | null = target;
  while (current) {
    fallbackElements.push(current);
    current = current.parentElement;
  }

  return fallbackElements;
}

export function findClosestInteractiveElementForLock(elements: HTMLElement[]): HTMLElement | null {
  return elements.find((element) => isInteractiveElementForLock(element)) ?? null;
}

export function findClosestNavigationTargetForLock(elements: HTMLElement[]): HTMLElement | null {
  return elements.find((element) => isNavigationTargetForLock(element)) ?? null;
}

export function isGwtInternalTabLink(href: string | null): boolean {
  if (!href) return false;

  try {
    const decoded = decodeURIComponent(href);
    if (decoded.includes('!{"tab":') || decoded.includes('_tab=')) {
      return true;
    }
  } catch {
    // Ignore malformed URLs from page markup.
  }

  return href.includes('!%7B%22tab%22') || href.includes('_tab=');
}

export function isTextElementForQuickEditLock(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (!QUICK_EDIT_TEXT_TAGS.includes(tagName) || hasSniptaleClass(element)) {
    return false;
  }

  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    if (
      Array.from(parent.classList).some((className) => className.startsWith(EXTENSION_CLASS_PREFIX))
    ) {
      return false;
    }
    parent = parent.parentElement;
  }

  return Boolean(element.textContent?.trim());
}
