type AssetReferenceAttribute = 'href' | 'poster' | 'src' | 'srcset';

const OFFSCREEN_PX_THRESHOLD = -1000;

export function removeAssetReference(element: Element, attribute: AssetReferenceAttribute): void {
  if (attribute === 'href' && element instanceof HTMLLinkElement) {
    element.remove();
    return;
  }

  element.removeAttribute(attribute);
}

function getHtmlElement(element: Element): HTMLElement | null {
  return element instanceof HTMLElement ? element : null;
}

function isZeroCssLength(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === '0' || normalizedValue === '0px' || normalizedValue === '0%';
}

function isOffscreenCssLength(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue.endsWith('px')) {
    return false;
  }

  const numericValue = Number(normalizedValue.slice(0, -2));
  return Number.isFinite(numericValue) && numericValue <= OFFSCREEN_PX_THRESHOLD;
}

function hasZeroDimensionAttribute(element: Element): boolean {
  return element.getAttribute('width') === '0' || element.getAttribute('height') === '0';
}

function hasHiddenInlineStyle(element: Element): boolean {
  const htmlElement = getHtmlElement(element);
  if (!htmlElement) {
    return false;
  }

  const { style } = htmlElement;
  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    isZeroCssLength(style.width) ||
    isZeroCssLength(style.height) ||
    (style.position === 'absolute' || style.position === 'fixed'
      ? isOffscreenCssLength(style.left) || isOffscreenCssLength(style.top)
      : false)
  );
}

export function isHiddenAssetElement(element: Element, root: ParentNode): boolean {
  let current: Element | null = element;
  while (current) {
    if (
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-hidden') === 'true' ||
      hasZeroDimensionAttribute(current) ||
      hasHiddenInlineStyle(current)
    ) {
      return true;
    }

    const parent: HTMLElement | null = current.parentElement;
    if (!parent || parent === root) {
      return false;
    }
    current = parent;
  }

  return false;
}
