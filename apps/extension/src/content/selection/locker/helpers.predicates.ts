import {
  EXTENSION_CLASS_PREFIX,
  INTERACTIVE_TAGS,
  NAVIGATION_DATA_ATTRIBUTES,
} from './helpers.constants';

export function hasSniptaleClass(element: HTMLElement): boolean {
  return (
    typeof element.className === 'string' &&
    element.className.split(' ').some((className) => className.startsWith(EXTENSION_CLASS_PREFIX))
  );
}

export function isExtensionElement(element: HTMLElement): boolean {
  return hasSniptaleClass(element) || Boolean(element.closest('[class*="sniptale-"]'));
}

export function isEditableElement(element: HTMLElement): boolean {
  return element.classList.contains('sniptale-editing') || element.isContentEditable;
}

export function hasFocusableTabIndex(element: HTMLElement): boolean {
  const tabindex = element.getAttribute('tabindex');
  if (tabindex === null) {
    return false;
  }

  const parsedTabIndex = Number.parseInt(tabindex, 10);
  return Number.isFinite(parsedTabIndex) && parsedTabIndex >= 0;
}

export function hasInteractiveAttributes(element: HTMLElement): boolean {
  return (
    element.hasAttribute('onclick') ||
    element.hasAttribute('onmousedown') ||
    element.hasAttribute('onpointerdown')
  );
}

export function hasNavigationAttributes(element: HTMLElement): boolean {
  return NAVIGATION_DATA_ATTRIBUTES.some((attribute) => {
    const value = element.getAttribute(attribute);
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function hasInteractiveGwtClasses(element: HTMLElement): boolean {
  if (typeof element.className !== 'string') {
    return false;
  }

  return [
    'button',
    'Button',
    'g-button',
    'gwt-Button',
    'gwt-HTML',
    'vectorIcon',
    'GAQEVERIPC',
    'actionsForceEnabled',
  ].some((token) => element.className.includes(token));
}

export function hasInteractiveParent(element: HTMLElement): boolean {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    if (
      typeof parent.className === 'string' &&
      (parent.className.includes('GAQEVERIPC') ||
        parent.className.includes('gwt-') ||
        parent.className.includes('actionsForceEnabled'))
    ) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

export function isStandardInteractiveTag(element: HTMLElement): boolean {
  return INTERACTIVE_TAGS.includes(element.tagName);
}
