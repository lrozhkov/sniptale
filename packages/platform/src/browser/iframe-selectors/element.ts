import { escapeCssIdentifier, escapeCssString } from './css';

function isSelectorRoot(node: Node): node is Node & ParentNode {
  return typeof (node as Partial<ParentNode>).querySelectorAll === 'function';
}

function isUniqueSelectorForElement(element: Element, selector: string): boolean {
  try {
    const root = element.getRootNode();
    const queryRoot: ParentNode = isSelectorRoot(root) ? root : element.ownerDocument;
    const matches = queryRoot.querySelectorAll(selector);
    return matches.length === 1 && matches.item(0) === element;
  } catch {
    return false;
  }
}

export class ElementSelectorAllocationError extends Error {
  readonly code = 'element-selector-unavailable';

  constructor() {
    super('Unable to create an exact selector for the target element');
    this.name = 'ElementSelectorAllocationError';
  }
}

function getPathSelector(element: Element): string | null {
  const path: string[] = [];
  let current: Element | null = element;

  while (current) {
    const currentElement: Element = current;
    const tagName = escapeCssIdentifier(currentElement.localName);
    const parentEl: Element | null = currentElement.parentElement;
    const parentNode = currentElement.parentNode;
    const selectorParent: ParentNode | null =
      parentEl ?? (parentNode && isSelectorRoot(parentNode) ? parentNode : null);

    if (!selectorParent) {
      path.unshift(tagName);
    } else {
      const siblings = Array.from(selectorParent.children).filter(
        (child: Element) => child.localName === currentElement.localName
      );
      const index = siblings.indexOf(currentElement);
      path.unshift(siblings.length > 1 ? `${tagName}:nth-of-type(${index + 1})` : tagName);
    }

    const selector = path.join(' > ');
    if (isUniqueSelectorForElement(element, selector)) {
      return selector;
    }

    current = parentEl;
  }

  return null;
}

export function getElementSelector(
  element: Element,
  options: { includeSniptaleId?: boolean } = {}
): string {
  const sniptaleId = element.getAttribute('data-sniptale-id');
  if (options.includeSniptaleId !== false && sniptaleId) {
    const selector = `[data-sniptale-id="${escapeCssString(sniptaleId)}"]`;
    if (isUniqueSelectorForElement(element, selector)) {
      return selector;
    }
  }

  if (element.id) {
    const selector = `#${escapeCssIdentifier(element.id)}`;
    if (isUniqueSelectorForElement(element, selector)) {
      return selector;
    }
  }

  const classes = Array.from(element.classList)
    .filter((className) => !className.match(/^(sniptale-|shadow-)/))
    .map(escapeCssIdentifier)
    .join('.');
  const tagName = escapeCssIdentifier(element.localName);

  if (classes) {
    const selector = `${tagName}.${classes}`;
    if (isUniqueSelectorForElement(element, selector)) {
      return selector;
    }
  }

  const pathSelector = getPathSelector(element);
  if (!pathSelector) {
    throw new ElementSelectorAllocationError();
  }

  return pathSelector;
}
