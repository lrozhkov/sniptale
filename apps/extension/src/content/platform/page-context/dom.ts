import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { isContentOwnedElement } from '../dom-host';
import { resolvePortalTheme } from '@sniptale/ui/theme/safe-portal';

const DEFAULT_CONTENT_RUNTIME_TREE_CLASSES = [
  'sniptale-toolbar',
  'sniptale-app',
  'sniptale-show-toolbar-button',
] as const;

type ContentRuntimeTreeOptions = {
  extraClasses?: readonly string[];
};

type ContentRuntimeUiOptions = {
  classNames?: readonly string[];
  classPrefixes?: readonly string[];
  closestSelectors?: readonly string[];
  extraRuntimeClasses?: readonly string[];
  portalElements?: readonly (Element | null | undefined)[];
};

function hasClassNamePrefix(target: HTMLElement, prefix: string): boolean {
  return Array.from(target.classList).some((className) => className.startsWith(prefix));
}

function isInsideContentRuntimeTree(
  target: HTMLElement,
  options: ContentRuntimeTreeOptions = {}
): boolean {
  let current: HTMLElement | null = target;
  const ownerBody = target.ownerDocument.body;
  const allowedClasses = new Set([
    ...DEFAULT_CONTENT_RUNTIME_TREE_CLASSES,
    ...(options.extraClasses ?? []),
  ]);

  while (current && current !== ownerBody) {
    if (
      Array.from(current.classList).some((className) => allowedClasses.has(className)) ||
      isContentOwnedElement(current)
    ) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

export function isContentRuntimeUiElement(
  target: HTMLElement,
  options: ContentRuntimeUiOptions = {}
): boolean {
  if (options.classPrefixes?.some((prefix) => hasClassNamePrefix(target, prefix))) {
    return true;
  }

  if (options.classNames?.some((className) => target.classList.contains(className))) {
    return true;
  }

  if (options.closestSelectors?.some((selector) => target.closest(selector))) {
    return true;
  }

  if (options.portalElements?.some((element) => element?.contains(target))) {
    return true;
  }

  return isInsideContentRuntimeTree(
    target,
    options.extraRuntimeClasses === undefined ? {} : { extraClasses: options.extraRuntimeClasses }
  );
}

export function createContentRuntimeUiGuard(options: ContentRuntimeUiOptions) {
  return (target: HTMLElement): boolean => isContentRuntimeUiElement(target, options);
}

export function applyContentRuntimeTheme(container: HTMLElement): void {
  const themeOwner = document.getElementById(CONTENT_ROOT_ID);
  const theme = resolvePortalTheme(themeOwner);

  if (!theme) {
    container.removeAttribute('data-theme');
    container.style.removeProperty('color-scheme');
    return;
  }

  container.setAttribute('data-theme', theme);
  container.style.colorScheme = theme;
}
