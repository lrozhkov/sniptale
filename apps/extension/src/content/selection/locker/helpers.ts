const EXTENSION_CLASS_PREFIX = 'sniptale-';
const INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
const NAVIGATION_DATA_ATTRIBUTES = [
  'href',
  'data-href',
  'data-url',
  'data-link',
  'data-target-url',
  'data-navigation-url',
];
const QUICK_EDIT_TEXT_TAGS = [
  'p',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'label',
  'a',
  'button',
];

function hasSniptaleClass(element: HTMLElement): boolean {
  return (
    typeof element.className === 'string' &&
    element.className.split(' ').some((className) => className.startsWith(EXTENSION_CLASS_PREFIX))
  );
}

function isExtensionElement(element: HTMLElement): boolean {
  return hasSniptaleClass(element) || Boolean(element.closest('[class*="sniptale-"]'));
}

function isEditableElement(element: HTMLElement): boolean {
  return element.classList.contains('sniptale-editing') || element.isContentEditable;
}

function hasFocusableTabIndex(element: HTMLElement): boolean {
  const tabindex = element.getAttribute('tabindex');
  if (tabindex === null) {
    return false;
  }

  const parsedTabIndex = Number.parseInt(tabindex, 10);
  return Number.isFinite(parsedTabIndex) && parsedTabIndex >= 0;
}

function hasInteractiveAttributes(element: HTMLElement): boolean {
  return (
    element.hasAttribute('onclick') ||
    element.hasAttribute('onmousedown') ||
    element.hasAttribute('onpointerdown')
  );
}

function hasNavigationAttributes(element: HTMLElement): boolean {
  return NAVIGATION_DATA_ATTRIBUTES.some((attribute) => {
    const value = element.getAttribute(attribute);
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function hasInteractiveGwtClasses(element: HTMLElement): boolean {
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

function hasInteractiveParent(element: HTMLElement): boolean {
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

function isStandardInteractiveTag(element: HTMLElement): boolean {
  return INTERACTIVE_TAGS.includes(element.tagName);
}

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
