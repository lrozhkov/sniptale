import { escapeCssIdentifier } from './css';

function getPathSelector(element: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== current.ownerDocument.body) {
    const currentElement: HTMLElement = current;
    const tagName = currentElement.tagName.toLowerCase();
    const parentEl: HTMLElement | null = currentElement.parentElement;

    if (!parentEl) {
      path.unshift(tagName);
      break;
    }

    const siblings = Array.from(parentEl.children).filter(
      (child: Element) => child.tagName === currentElement.tagName
    );
    const index = siblings.indexOf(currentElement);
    path.unshift(siblings.length > 1 ? `${tagName}:nth-of-type(${index + 1})` : tagName);
    current = parentEl;

    if (path.length >= 5) {
      break;
    }
  }

  return path.join(' > ');
}

export function getElementSelector(element: HTMLElement): string {
  if (element.dataset['sniptaleId']) {
    return `[data-sniptale-id="${element.dataset['sniptaleId']}"]`;
  }

  if (element.id) {
    return `#${escapeCssIdentifier(element.id)}`;
  }

  const classes = Array.from(element.classList)
    .filter((className) => !className.match(/^(sniptale-|shadow-)/))
    .join('.');
  const tagName = element.tagName.toLowerCase();

  if (classes) {
    const selector = `${tagName}.${classes}`;
    try {
      const matches = element.ownerDocument.querySelectorAll(selector);
      if (matches.length === 1) {
        return selector;
      }
    } catch {
      // Invalid selector, continue to path fallback.
    }
  }

  return getPathSelector(element);
}
